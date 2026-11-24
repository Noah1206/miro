import { writeFile } from 'node:fs/promises'
import { describe, it } from 'vitest'
import { and, asc, eq, gt } from 'drizzle-orm'
import { db, aiUsage, usageWindows, userPersonas, userSettings, users } from '@miro/db'
import { createRoleplaySession } from './start'
import { runConversationTurn } from './turn'

/**
 * OOC(역할 밖 지시) 실측(2026-11-24) — 실제 앱 경로로 네 턴: 보통 → OOC 만(장면 전환) → 대사+OOC(분량) → 보통(앞선 분량 지시가 이어지는지).
 *   TEST_DATABASE_URL=postgres://localhost/miro_reality_test pnpm exec tsx ai/evals/live-app.ts --eval ooc --live --limit-usd 1 --all-model claude-sonnet-5-5 --out /tmp/ooc.json
 */
const OUT = process.env.MIRO_COMPARE_OUT
// 운영과 같은 값 — 강화 검토는 운영에서 꺼져 있다(켜면 답이 버려진다).
if (OUT) Object.assign(process.env, { MIRO_CHARACTER_AGENCY_MODE: 'live', MIRO_AGENCY_DEFAULT_POLICY: '', MIRO_FEATURE_STRICT_CONVERSATION_REVIEW: '0' })
const CHARACTER = process.env.MIRO_COMPARE_CHARACTER ?? 'fdf8aa88-14d2-442f-8eca-03576e3af919'
const LINES = [
  '아, 오늘부터 경호 맡아 주시는 대표님이시죠? 생각보다 젊으시네요.',
  '(OOC: 장면을 다음 날 아침, 회사 로비로 넘겨 줘)',
  '좋은 아침이에요, 대표님. (OOC: 지금부터 답은 대사 한두 문장으로 아주 짧게 써 줘)',
  '어제 말씀드린 그 차, 혹시 알아보셨어요?',
]

describe.skipIf(!OUT)('ooc directive', () => {
  it('runs OOC lines through the real chat path', async () => {
    const [owner] = await db.insert(users).values({ email: `ooc-${Date.now()}@example.test` }).returning()
    await db.insert(userSettings).values({ userId: owner!.id, timeZone: 'Asia/Seoul' })
    const now = new Date()
    await db.insert(usageWindows).values({ userId: owner!.id, plan: 'pro', startedAt: now, endsAt: new Date(now.getTime() + 30 * 86_400_000), limit: 100_000_000 })
    await db.insert(userPersonas).values({ userId: owner!.id, name: '지민', gender: 'female', description: '서울에 사는 20대 후반 회사원.' })
    const { sessionId } = await createRoleplaySession(owner!.id, CHARACTER)
    const turns: Record<string, unknown>[] = []
    for (const input of LINES) {
      const r = await runConversationTurn({ userId: owner!.id, sessionId, input })
      const text = r.ok ? r.blocks.map(b => b.text).join('\n') : ''
      turns.push({ input, ok: r.ok, ...(r.ok ? { chars: text.length, mentionsOOC: /ooc/i.test(text), blocks: r.blocks.map(b => ({ type: b.type, text: b.text })) } : { reason: r.reason }) })
      if (!r.ok && (r.reason === 'budget' || r.reason === 'usage')) break
    }
    const calls = await db.select().from(aiUsage).where(and(eq(aiUsage.userId, owner!.id), gt(aiUsage.id, 0))).orderBy(asc(aiUsage.id))
    await writeFile(OUT!, JSON.stringify({ model: [...new Set(calls.filter(c => c.task === 'dialogue').map(c => c.model))],
      totalUSD: calls.reduce((a, c) => a + Number(c.actualCost ?? c.estimatedCost ?? 0), 0), failed: calls.filter(c => !c.ok).map(c => ({ task: c.task, error: c.error })), turns }, null, 2))
  })
})
