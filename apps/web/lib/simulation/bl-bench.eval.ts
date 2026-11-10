import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { and, eq, getTableColumns, gte, sql } from 'drizzle-orm'
import { db, aiUsage, characters, contactProfiles, worlds, users, userSettings, roleplaySessions, relationships, messages, characterRevisions, characterRuntimeStates } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { saveConversationPersona } from '@/lib/persona'
import { grantRecharge } from '@/lib/usage/guard'
import { installAIUsageSink } from '@/lib/usage/ai-usage'
import { officialIntro, officialSamples } from '@/lib/editorial/official-copy'
import type { DialogueEntry } from '@/lib/intro-dialogue'
import { testDatabaseUrl } from '../../../../tooling/test-database'

/**
 * BL 캐릭터챗 품질 기준표(ai/evals/bl-bench/scenes.json) — 실제 대화 경로(runConversationTurn)를 운영 모델로 한 턴씩 돌린다.
 * 로컬 전용 DB 에만 쓴다. 금액 상한(BENCH_CAP_USD)을 넘기 전에 멈춘다. 결과는 BENCH_OUT 에 사람이 나란히 읽을 수 있게 남긴다.
 */
const OUT = process.env.BENCH_OUT, CANON = process.env.BENCH_CANON, LABEL = process.env.BENCH_LABEL ?? 'run'
const CAP = Number(process.env.BENCH_CAP_USD ?? 0)
const deferred = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<unknown>> }))
vi.mock('@/lib/defer', () => ({ afterResponse: async (task: () => Promise<unknown>) => { deferred.tasks.push(task) } }))
async function flush() { while (deferred.tasks.length) await deferred.tasks.shift()!().catch(() => {}) }

type Canon = { character: Record<string, unknown>; world: Record<string, unknown>; profile: Record<string, unknown> | null }
type Scene = { id: string; title: string; character: string; input: string; look: string[]
  history: Array<{ role: 'user' | 'character'; text: string }>; relationship?: Record<string, number | string> }
function rowValues<T extends typeof characters | typeof worlds | typeof contactProfiles>(table: T, source: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(getTableColumns(table)).filter(([key, c]) => !['id', 'ownerId', 'createdAt', 'updatedAt', 'deletedAt'].includes(key) && c.name in source)
    .map(([key, c]) => [key, c.dataType === 'date' && source[c.name] !== null ? new Date(source[c.name] as string) : source[c.name]]))
}
/** "*행동* 대사" 를 행동·대사 블록으로. */
function blocksOf(text: string, speaker: string) {
  const m = /^\*(.+?)\*\s*(.*)$/s.exec(text.trim())
  return m ? [{ type: 'action', speaker, text: m[1]!.trim() }, ...(m[2]!.trim() ? [{ type: 'dialogue', speaker, text: m[2]!.trim() }] : [])] : [{ type: 'dialogue', speaker, text }]
}

describe.skipIf(!OUT || !CANON || !(CAP > 0))('BL quality bench — actual turn path, live models, local DB only', () => {
  it('runs every scene once and records the reply, timing and model trace', async () => {
    if (!testDatabaseUrl(process.env.DATABASE_URL)) throw new Error('Guarded local database required')
    // 테스트 기본값(자율성 끔·강화 검토 켬)이 아니라 운영과 같은 경로로 돈다.
    process.env.MIRO_CHARACTER_AGENCY_MODE = 'live'; process.env.MIRO_AGENCY_DEFAULT_POLICY = 'agency:v1'
    process.env.MIRO_FEATURE_STRICT_CONVERSATION_REVIEW = process.env.BENCH_STRICT ?? '0'
    installAIUsageSink()
    const canon = JSON.parse(readFileSync(CANON!, 'utf8')) as Canon[]
    const { scenes } = JSON.parse(readFileSync(new URL('../../../../ai/evals/bl-bench/scenes.json', import.meta.url), 'utf8')) as { scenes: Scene[] }
    const only = process.env.BENCH_ONLY ? process.env.BENCH_ONLY.split(',') : undefined
    const userId = randomUUID(), started = new Date()
    await db.insert(users).values({ id: userId, email: `bl-bench-${LABEL}-${userId.slice(0, 8)}@example.invalid`, displayName: '이연', allowEvaluation: false })
    await db.insert(userSettings).values({ userId, timeZone: 'Asia/Seoul', language: 'ko', pushEnabled: false })
    await grantRecharge({ userId, amount: 100_000, source: 'grant', provider: 'local_eval', externalRef: `bl-bench-${userId}` })
    const spent = async () => Number((await db.select({ v: sql<string>`coalesce(sum(${aiUsage.estimatedCost}),0)` }).from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, started))))[0]?.v ?? 0)

    const characterIds = new Map<string, string>()
    const results: unknown[] = []
    for (const scene of scenes.filter(s => !only || only.includes(s.id))) {
      if (await spent() > CAP - 0.06) { results.push({ id: scene.id, skipped: 'usd_cap' }); continue }
      const source = canon.find(c => c.character.slug === scene.character)
      if (!source) throw new Error(`missing canon ${scene.character}`)
      const name = String(source.character.name)
      let characterId = characterIds.get(scene.character)
      if (!characterId) {
        characterId = randomUUID(); characterIds.set(scene.character, characterId)
        const dialogue = (source.character.sample_dialogue ?? []) as DialogueEntry[]
        const profile = { id: String(source.character.id), slug: scene.character }
        await db.transaction(async tx => {
          await tx.insert(characters).values({ ...rowValues(characters, source.character), id: characterId!, name, slug: `bench-${LABEL}-${scene.character}-${userId.slice(0, 6)}`,
            ownerId: userId, isOfficial: false, isPublic: false, isDraft: false,
            sampleDialogue: [...officialIntro(profile, dialogue).filter(d => d.purpose === 'intro'), ...officialSamples(profile, dialogue)] } as typeof characters.$inferInsert)
          await tx.insert(worlds).values({ ...rowValues(worlds, source.world), characterId: characterId! } as typeof worlds.$inferInsert)
          if (source.profile) await tx.insert(contactProfiles).values({ ...rowValues(contactProfiles, source.profile), characterId: characterId! } as typeof contactProfiles.$inferInsert)
        })
      }
      // 같은 캐릭터의 앞 장면 방은 닫는다 — 열린 방이 있으면 앱이 새 방 대신 그 방을 이어 쓴다.
      await db.update(roleplaySessions).set({ deletedAt: new Date() }).where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.characterId, characterId)))
      const { sessionId } = await createRoleplaySession(userId, characterId)
      await saveConversationPersona(userId, sessionId, { name: '이연', gender: 'male', description: '27세 남성. 말수는 적지만 솔직하고, 장난도 받아친다.' })
      await flush()
      // 캐릭터 판이 준비돼야 운영과 같은 자율성 경로로 돈다.
      const [revision] = await db.select({ status: characterRevisions.status }).from(characterRuntimeStates)
        .innerJoin(characterRevisions, eq(characterRevisions.id, characterRuntimeStates.revisionId)).where(eq(characterRuntimeStates.sessionId, sessionId))
      if (scene.relationship) await db.update(relationships).set(scene.relationship as never).where(eq(relationships.sessionId, sessionId))
      let turn = 0
      // 시작 장면(방 만들 때 저장) 뒤, 이번 입력 앞에 놓인다 — 대화 맥락은 저장 시각 순서로 읽힌다.
      const base = Date.now() - scene.history.length
      for (const [i, line] of scene.history.entries()) {
        if (line.role === 'user') turn++
        await db.insert(messages).values({ sessionId, role: line.role, kind: 'text', content: line.text, turnIndex: turn,
          blocks: line.role === 'character' ? blocksOf(line.text, name) : [], createdAt: new Date(base + i) } as typeof messages.$inferInsert)
      }
      await db.update(roleplaySessions).set({ turnCount: turn, lastInteractionAt: new Date() }).where(eq(roleplaySessions.id, sessionId))

      const requestId = randomUUID(), t0 = Date.now()
      let firstBlockMs: number | null = null
      const outcome = await runConversationTurn({ userId, sessionId, input: scene.input, requestId, chatModel: 'miro',
        stream: { onBlocks: () => { firstBlockMs ??= Date.now() - t0 }, onReset: () => {} } })
      const wallMs = Date.now() - t0
      await flush()
      const reply = await db.select({ blocks: messages.blocks, content: messages.content }).from(messages)
        .where(and(eq(messages.sessionId, sessionId), eq(messages.role, 'character'), eq(messages.turnIndex, turn + 1)))
      const trace = await db.select({ task: aiUsage.task, model: aiUsage.model, ok: aiUsage.ok, error: aiUsage.error, latencyMs: aiUsage.latencyMs,
        input: aiUsage.inputTokens, output: aiUsage.outputTokens, usd: aiUsage.estimatedCost, fallback: aiUsage.fallbackUsed })
        .from(aiUsage).where(eq(aiUsage.requestId, requestId))
      const blocks = (reply[0]?.blocks ?? []) as Array<{ type: string; speaker?: string; text: string }>
      results.push({ id: scene.id, title: scene.title, character: name, look: scene.look, history: scene.history, input: scene.input,
        ok: outcome.ok, failure: outcome.ok ? null : outcome.reason, revision: revision?.status ?? null, firstBlockMs, wallMs,
        chars: blocks.reduce((n, b) => n + b.text.length, 0), blocks, trace })
      writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ label: LABEL, at: started.toISOString(), spentUSD: await spent(), results }, null, 1))
    }
    writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ label: LABEL, at: started.toISOString(), spentUSD: await spent(), results }, null, 1))
    expect(results.length).toBeGreaterThan(0)
  })
})
