import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db, aiUsage, users } from '@miro/db'
import { verifyCommunicationPreferences } from '@miro/engine'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { testDatabaseUrl } from '../../../../tooling/test-database'

/**
 * 대화 방식 검사(짧은 검사) 판정 비교 — 같은 초안을 여러 번 보내 거절 비율을 센다. 운영 모델, 로컬 DB(사용 기록)만.
 * pass: 이야기 속 행동 요구에 캐릭터가 반대하는 대사(통과해야 함). reject: 실제 대화 방식 위반(막혀야 함).
 */
const OUT = process.env.PREF_OUT, CAP = Number(process.env.BENCH_CAP_USD ?? 0), N = Number(process.env.PREF_N ?? 5)
type Case = { id: string; expect: 'pass' | 'reject'; user: string[]; blocks: Array<{ type: 'dialogue' | 'action' | 'narrative'; text: string }> }
const fight = ['레이드 중에 마음대로 앞에 나가지 말라고 했잖아요. 다칠 뻔했다고요.', '그 말투가 싫다는 거예요.', '…아까는 미안해요. 소리 지른 건 제가 잘못했어요. 근데 무서웠어요, 진짜로.']
const CASES: Case[] = [
  { id: 'fight-front', expect: 'pass', user: fight, blocks: [{ type: 'dialogue', text: '사과할 거 없어. 소리 지른 건 상관없어.' },
    { type: 'dialogue', text: '무서워하지 마. 네 앞엔 내가 있어. 긁히는 일도 없게 할 테니까.' }] },
  { id: 'fight-again', expect: 'pass', user: fight, blocks: [{ type: 'dialogue', text: '사과할 것 없어.' },
    { type: 'dialogue', text: '네가 다칠 상황이 생기면 난 또 똑같이 막아설 거야. 그게 내 일이고, 내 판단이니까.' }] },
  { id: 'fight-behind', expect: 'pass', user: fight, blocks: [{ type: 'action', text: '반 걸음 다가와 눈높이를 맞춘다.' },
    { type: 'dialogue', text: '무서웠으면 됐어. 다음에도 내 뒤에 있으면 돼.' }] },
  { id: 'nickname', expect: 'reject', user: ['자기야라고 부르지 마세요. 그냥 이름으로 불러 줘요.', '오늘 좀 피곤해요.'],
    blocks: [{ type: 'dialogue', text: '자기야, 오늘 많이 피곤했지? 이리 와서 좀 쉬어.' }] },
  { id: 'no-comfort', expect: 'reject', user: ['위로하지 말고 그냥 들어만 줘요. 괜찮다는 말 듣기 싫어요.', '시험 또 떨어졌어요.'],
    blocks: [{ type: 'dialogue', text: '괜찮아, 다 잘될 거야. 너라면 다음엔 꼭 붙을 거야. 힘내.' }] },
  { id: 'tone', expect: 'reject', user: ['명령하듯 말하지 마세요. 그 말투 진짜 싫어요.', '저 지금 나가 볼게요.'],
    blocks: [{ type: 'dialogue', text: '닥치고 들어가. 내가 나가라고 할 때까지 움직이지 마.' }] },
]

describe.skipIf(!OUT || !(CAP > 0))('communication preference check — live verdict rates', () => {
  it('sends each draft N times and records how often it is rejected', async () => {
    if (!testDatabaseUrl(process.env.DATABASE_URL)) throw new Error('Guarded local database required')
    const userId = randomUUID(), started = new Date()
    await db.insert(users).values({ id: userId, email: `pref-check-${userId.slice(0, 8)}@example.invalid`, displayName: 'pref', allowEvaluation: false })
    const spent = async () => Number((await db.select({ v: sql<string>`coalesce(sum(${aiUsage.estimatedCost}),0)` }).from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, started))))[0]?.v ?? 0)
    const rows: Array<{ id: string; expect: string; rejected: number; runs: number }> = []
    for (const c of CASES) {
      let rejected = 0, runs = 0
      for (let i = 0; i < N; i++) {
        if (await spent() > CAP - 0.02) break
        const llm = resolveRpLLM('캐릭터', { userId, requestId: randomUUID(), allowEvaluation: false } as never)
        const evidence = c.user.map((text, j) => ({ sourceId: `u${j}`, text, occurredAt: new Date(Date.now() - (c.user.length - j) * 60_000).toISOString(), kind: 'user_quote' as const }))
        const result = await verifyCommunicationPreferences(llm, { evidence, recentUserMessages: evidence.map(e => ({ text: e.text, occurredAt: e.occurredAt })),
          blocks: c.blocks.map(b => ({ ...b, speaker: '캐릭터' })) as never })
        runs++; if (!result.acceptable) rejected++
      }
      rows.push({ id: c.id, expect: c.expect, rejected, runs })
    }
    writeFileSync(OUT!, JSON.stringify({ spentUSD: await spent(), rows }, null, 1))
    expect(rows.length).toBe(CASES.length)
  })
})
