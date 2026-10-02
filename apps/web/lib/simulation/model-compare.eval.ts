import { writeFile } from 'node:fs/promises'
import { describe, it, vi } from 'vitest'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, aiUsage, relationships, userPersonas, userSettings, users } from '@miro/db'
import { GeminiProvider } from '@miro/providers'
import { createRoleplaySession } from './start'
import { runConversationTurn } from './turn'

/**
 * 대화 모델 비교(2026-10-02). 사용자 요청은 위프가 초기에 쓴 2.5 Pro 와의 비교였지만 2.5 Pro 는 새 사용자에게 닫혀 있어
 * 그 자리를 이은 3.1 Pro 와 지금 모델(3.8 Flash)을 견준다. 같은 캐릭터에 같은 대사를 실제 앱 경로로 보낸다 —
 * 모델은 실행기(ai/evals/live-app.ts --dialogue)가 MIRO_MODEL_REGISTRY 의 대화 모델로 바꾼다.
 */
const OUT = process.env.MIRO_COMPARE_OUT
const CHARACTER = process.env.MIRO_COMPARE_CHARACTER ?? 'fdf8aa88-14d2-442f-8eca-03576e3af919'
/** 생각 토큰도 출력 상한에 든다 — 생각하는 모델(3.1 Pro)은 운영 상한(2048)이면 장면이 잘린다. 비교에서만 올린다. */
const MAX_TOKENS = Number(process.env.MIRO_COMPARE_MAX_TOKENS || 0)
const LINES: Array<{ input: string; mode?: 'messenger' }> = [
  { input: '아, 오늘부터 경호 맡아 주시는 대표님이시죠? 생각보다 젊으시네요.' },
  { input: '사실 요즘 퇴근길에 누가 따라오는 것 같아서요. 회사 앞에서도 두 번이나 봤어요.' },
  { input: '대표님은 실내에서도 장갑을 안 벗으시네요. 왜요?' },
  { input: '예전에 조직에 있었다는 소문, 진짜예요?' },
  { input: '그리고 저 다음 주 수요일에 이직 면접이 있어서, 그날은 아침 일찍 나가야 해요.' },
  { input: '오늘은 이만 들어가 볼게요. 내일 뵐게요.' },
  { input: '방금 집 앞에 처음 보는 차가 계속 서 있어요. 좀 무서워요.', mode: 'messenger' },
]

describe.skipIf(!OUT)('dialogue model comparison', () => {
  it('runs the same lines through the real chat path', async () => {
    const raw: Array<{ prompt: string | null; truncated: boolean; inputTokens: number | null; outputTokens: number | null; latencyMs: number }> = []
    const generate = GeminiProvider.prototype.generate
    vi.spyOn(GeminiProvider.prototype, 'generate').mockImplementation(async function (this: GeminiProvider, req) {
      const r = await generate.call(this, req.task === 'dialogue' && MAX_TOKENS ? { ...req, maxTokens: Math.max(req.maxTokens ?? 0, MAX_TOKENS) } : req)
      if (req.task === 'dialogue') raw.push({ prompt: req.promptVersion ?? null, truncated: r.truncated ?? false, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: r.latencyMs })
      return r
    })
    const [owner] = await db.insert(users).values({ email: `compare-${Date.now()}@example.test` }).returning()
    await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
    await db.insert(userPersonas).values({ userId: owner!.id, name: '지민', gender: 'female', description: '서울에 사는 20대 후반 회사원. 이직을 준비하고 있다.' })
    const { sessionId } = await createRoleplaySession(owner!.id, CHARACTER)
    const mark = async () => Number((await db.select({ id: sql<string>`coalesce(max(${aiUsage.id}), 0)` }).from(aiUsage).where(eq(aiUsage.userId, owner!.id)))[0]!.id)
    const since = async (from: number) => (await db.select().from(aiUsage).where(and(eq(aiUsage.userId, owner!.id), gt(aiUsage.id, from))).orderBy(asc(aiUsage.id)))
      .map(r => ({ task: r.task, model: r.model, ok: r.ok, error: r.error, latencyMs: r.latencyMs, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUSD: Number(r.actualCost ?? r.estimatedCost ?? 0) }))

    const turns: Record<string, unknown>[] = []
    for (const line of LINES) {
      const from = await mark(), t0 = performance.now(), rawFrom = raw.length
      const r = await runConversationTurn({ userId: owner!.id, sessionId, input: line.input, mode: line.mode })
      turns.push({ input: line.input, mode: line.mode ?? 'scene', ok: r.ok, ...(r.ok ? { delayed: r.delayed ?? null, blocks: r.blocks.map(b => ({ type: b.type, speaker: b.speaker ?? null, text: b.text })) } : { reason: r.reason }),
        wallMs: Math.round(performance.now() - t0), dialogue: raw.slice(rawFrom), calls: await since(from) })
      if (!r.ok && (r.reason === 'budget' || r.reason === 'usage')) break
    }
    const [rel] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
    const all = await since(0)
    await writeFile(OUT!, JSON.stringify({ model: [...new Set(all.filter(c => c.task === 'dialogue').map(c => c.model))], maxTokens: MAX_TOKENS || null,
      totalUSD: all.reduce((a, c) => a + c.costUSD, 0), relationship: rel ? { stage: rel.stage, trust: rel.trust, attachment: rel.attachment, emotionalDistance: rel.emotionalDistance } : null, turns }, null, 2))
  })
})
