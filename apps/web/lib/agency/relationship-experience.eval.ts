import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { asc, eq, getTableColumns, sql } from 'drizzle-orm'
import { db, aiUsage, characters, contactProfiles, worlds, users, userSettings, roleplaySessions, relationships,
  characterRevisions, characterRuntimeStates } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { changeStoryDate } from '@/lib/simulation/story-date'
import { evaluateSession } from '@/lib/reality/evaluate'
import { grantRecharge } from '@/lib/usage/guard'
import { officialIntro, officialSamples } from '@/lib/editorial/official-copy'
import type { DialogueEntry } from '@/lib/intro-dialogue'
import * as push from '@/lib/reality/push-outbox'
import * as agencyEngine from '../../../../packages/engine/src/agency'
import * as engine from '@miro/engine'
import { testDatabaseUrl } from '../../../../tooling/test-database'

/** Opt-in live app journey. Public canon is copied read-only; every mutation uses a guarded LOCAL test DB. */
const OUT = process.env.MIRO_RELATIONSHIP_EVAL_OUT
const CANON = process.env.MIRO_RELATIONSHIP_EVAL_CANON
const deferred = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<unknown>>, errors: [] as string[] }))
vi.mock('@/lib/defer', () => ({ afterResponse: async (task: () => Promise<unknown>) => { deferred.tasks.push(task) } }))
async function flush() {
  while (deferred.tasks.length) await deferred.tasks.shift()!().catch(e => deferred.errors.push(e instanceof Error ? e.message : 'unknown'))
}
type Canon = { character: Record<string, unknown>; world: Record<string, unknown>; profile: Record<string, unknown> | null }
const scriptName = process.env.MIRO_RELATIONSHIP_EVAL_SCRIPT
const SCRIPT = scriptName === 'calendar' ? [
  '커피보다 따뜻한 우유가 좋아요. 기억해 주세요.',
  '오랜만이에요.',
] : scriptName === 'contact' ? [
  '커피 대신 따뜻한 우유를 좋아해. 오늘 면접 결과 기다리는데 좀 떨려.',
  '10분 뒤에 면접 결과가 나와. 그때 직접 찾아오거나 말로 묻지 말고, 문자로 먼저 결과를 물어봐 줄래?',
] : [
  '커피 대신 따뜻한 우유를 좋아해. 오늘 면접 결과 기다리는데 좀 떨려.',
  '내일 저녁 8시에 면접 결과가 나오면 먼저 연락해서 물어봐 줄래?',
  '생각해보니 결과는 내가 먼저 알려줄게. 내일 연락해 달라는 부탁은 취소할게. 아까 너무 쉽게 괜찮다고 해서 조금 서운했어.',
  '아까 서운하다고 날카롭게 말한 건 미안해. 오늘은 혼자 있고 싶어. 먼저 연락하지 마.',
  '고마워. 너는 지금 뭐 하고 있어?',
  '이제 다시 먼저 연락해도 괜찮아. 결과가 나왔어. 면접 붙었어!',
]
/** Only columns in the current schema; nested authored JSON is left untouched. */
function rowValues<T extends typeof characters | typeof worlds | typeof contactProfiles>(table: T, source: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(getTableColumns(table)).filter(([key, c]) => !['id', 'ownerId', 'createdAt', 'updatedAt', 'deletedAt'].includes(key) && c.name in source)
    .map(([key, c]) => [key, c.dataType === 'date' && source[c.name] !== null ? new Date(source[c.name] as string) : source[c.name]]))
}
describe.skipIf(!OUT || !CANON)('relationship experience — live authored characters', () => {
  it('runs promises, cancellation, hurt/repair, space and explicit recontact through actual app entry points', async () => {
    if (!testDatabaseUrl(process.env.DATABASE_URL)) throw new Error('Local test database required')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    vi.stubEnv('MIRO_AGENCY_DEFAULT_POLICY', 'agency:v1')
    vi.spyOn(push, 'deliverRealityPush').mockResolvedValue(0) // No real person/device is contacted.
    const checks: Array<Record<string, unknown>> = []
    const compilationFailures: unknown[] = []
    const compile = engine.compileAuthoredCharacter
    vi.spyOn(engine, 'compileAuthoredCharacter').mockImplementation(async (...args) => {
      try { return await compile(...args) }
      catch (error) {
        compilationFailures.push(error instanceof engine.AgencyCompilationError ? error.issues : String(error))
        throw error
      }
    })
    const verify = agencyEngine.verifyAgencyRealization
    vi.spyOn(agencyEngine, 'verifyAgencyRealization').mockImplementation(async (llm, input, options) => {
      const result = await verify(llm, input, options)
      if (!result.ok) checks.push({ action: input.decision.action, chosen: input.decision.candidate.description,
        text: input.blocks.map(b => b.text), issues: result.issues })
      return result
    })
    const selected = process.env.MIRO_RELATIONSHIP_EVAL_CHARACTERS?.split(',')
    const canon = (JSON.parse(await readFile(CANON!, 'utf8')) as Canon[]).filter(c => !selected || selected.includes(String(c.character.slug)))
    if (!canon.length) throw new Error('No selected canon')
    const runs: Array<Record<string, unknown>> = []
    const created: Array<{ userId: string; characterId: string }> = []
    let stopped: string | null = null
    try {
      for (const source of canon) {
        const [owner] = await db.insert(users).values({ email: `relationship-eval-${randomUUID()}@example.test`, displayName: '윤', allowEvaluation: false }).returning()
        await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul', language: 'ko' })
        await grantRecharge({ userId: owner!.id, amount: 10_000, source: 'grant', provider: 'local_eval', externalRef: randomUUID() })
        const dialogue = (source.character.sample_dialogue ?? []) as DialogueEntry[]
        const profile = { id: String(source.character.id), slug: String(source.character.slug) }
        const curated = [...officialIntro(profile, dialogue).filter(d => d.purpose === 'intro'), ...officialSamples(profile, dialogue)]
        const [character] = await db.insert(characters).values({ ...rowValues(characters, source.character),
          name: String(source.character.name), slug: `relationship-eval-${randomUUID()}`, ownerId: owner!.id,
          isOfficial: false, isPublic: false, isDraft: false, experienceType: 'reality', sampleDialogue: curated,
        } as typeof characters.$inferInsert).returning()
        created.push({ userId: owner!.id, characterId: character!.id })
        await db.insert(worlds).values({ ...rowValues(worlds, source.world), characterId: character!.id } as typeof worlds.$inferInsert)
        // Free for this evaluation so wall-clock routine does not turn the test into a delayed reply.
        await db.insert(contactProfiles).values({ ...rowValues(contactProfiles, source.profile ?? {}), characterId: character!.id,
          enabled: true, activeHoursStart: '00:00', activeHoursEnd: '23:59', preferredChannel: 'message',
          callProbability: 0, videoCallProbability: 0, photoProbability: 0, voiceMessageProbability: 0,
          routine: { version: 1, source: 'authored', note: 'evaluation availability', generatedAt: new Date().toISOString(),
            blocks: [{ days: [], start: '00:00', end: '23:59', label: '자유 시간', availability: 'free' }] },
        })
        const { sessionId } = await createRoleplaySession(owner!.id, character!.id)
        await flush()
        if (scriptName === 'calendar') expect((await changeStoryDate(sessionId, owner!.id, '2026-10-11', null)).ok).toBe(true)
        const [revision] = await db.select({ status: characterRevisions.status }).from(characterRuntimeStates)
          .innerJoin(characterRevisions, eq(characterRevisions.id, characterRuntimeStates.revisionId)).where(eq(characterRuntimeStates.sessionId, sessionId))
        const state = async () => {
          const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
          const [rel] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
          const [runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId))
          return { policy: session!.policyVersion, boundary: session!.contactBoundary, stage: rel!.stage, trust: rel!.trust,
            goals: runtime?.state.goals.map(g => ({ description: g.description, status: g.status, dueAt: g.dueAt })),
            beliefs: runtime?.state.beliefs.map(b => ({ statement: b.statement, confidence: b.confidence })) }
        }
        const units: Array<Record<string, unknown>> = []
        runs.push({ character: source.character.name, slug: source.character.slug, revision: revision?.status, units })
        expect(revision?.status, `Character preparation failed: ${source.character.slug}`).toBe('ready')
        for (const [index, input] of SCRIPT.entries()) {
          const started = performance.now()
          const result = await runConversationTurn({ userId: owner!.id, sessionId, input, requestId: randomUUID(), mode: 'chat' })
          await flush()
          const stored = await state()
          units.push({ kind: 'turn', index: index + 1, input, wallMs: Math.round(performance.now() - started),
            outcome: result.ok ? 'ok' : result.reason, text: result.ok ? result.responseText : null, state: stored })
          console.log(JSON.stringify({ character: source.character.name, turn: index + 1, outcome: result.ok ? 'ok' : result.reason }))
          if (scriptName === 'calendar' && index === 0 && result.ok) {
            const changed = await changeStoryDate(sessionId, owner!.id, '2026-10-18', '2026-10-11')
            expect(changed.ok).toBe(true)
            units.push({ kind: 'story_date', result: changed })
          }
          if (index === 3 || index === 4) {
            const usageBefore = Number((await db.select({ count: sql<string>`count(*)` }).from(aiUsage))[0]!.count)
            const checked = await evaluateSession(sessionId)
            await flush()
            const usageAfter = Number((await db.select({ count: sql<string>`count(*)` }).from(aiUsage))[0]!.count)
            units.push({ kind: 'paused_background', result: checked, modelCalls: usageAfter - usageBefore })
            expect(checked).toEqual({ outcome: 'suppressed', reason: 'user_boundary' })
            expect(usageAfter).toBe(usageBefore)
          }
          if (!result.ok) stopped = result.reason
          expect(result.ok, `Conversation failed: ${stopped}`).toBe(true)
        }
        if (stopped) break
        if (scriptName === 'calendar') continue
        const checked = await evaluateSession(sessionId, new Date(Date.now() + (SCRIPT.length === 2 ? 20 / 60 : 16) * 3_600_000), { background: true })
        await flush()
        units.push({ kind: 'resumed_background', result: checked, state: await state() })
        if (process.env.MIRO_RELATIONSHIP_EVAL_EXPECT_CONTACT === '1') expect(checked).toMatchObject({ outcome: 'sent' })
      }
    } finally {
      await flush()
      const ids = created.map(c => c.userId)
      const calls = (await db.select().from(aiUsage).orderBy(asc(aiUsage.id))).filter(c => c.userId && ids.includes(c.userId))
        .map(c => ({ task: c.task, version: c.promptVersion, model: c.model, status: c.status, ok: c.ok, error: c.error,
          input: c.inputTokens, output: c.outputTokens, costUSD: Number(c.actualCost ?? c.estimatedCost ?? c.reservedCost ?? 0) }))
      await writeFile(OUT!, JSON.stringify({ at: new Date().toISOString(), localDatabase: true, provider: 'live',
        routine: 'temporarily free for evaluation only', stopped, errors: deferred.errors, compilationFailures, checks, runs, calls,
        costUSD: calls.reduce((n, c) => n + c.costUSD, 0) }, null, 2))
      for (const item of created) { await db.delete(users).where(eq(users.id, item.userId)); await db.delete(characters).where(eq(characters.id, item.characterId)) }
    }
  })
})
