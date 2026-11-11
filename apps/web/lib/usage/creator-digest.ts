import { and, gte, inArray, lt, sql } from 'drizzle-orm'
import { db, opsAlerts, rechargeGrants } from '@miro/db'
import { pushToUser } from '@/lib/push/to-user'
import { CHEER_PROVIDER, CREATOR_REWARD_FREE_PROVIDER, CREATOR_REWARD_PROVIDER } from './creator-reward'

/**
 * 11/11 크리에이터 주간 알림 — 월요일 10시(한국 시간) 이후 첫 유지보수 때, 지난주(월~일) 창작 보상·받은 응원이 있던 사람에게 한 번.
 * 보낸 기록은 ops_alerts 키(creator_digest:주:사용자)로 남겨 크론이 15분마다 돌아도·늦게 돌아도 한 주에 한 번만.
 */
export async function sendCreatorDigests(now = new Date()): Promise<number> {
  const k = new Date(now.getTime() + 9 * 3600_000)
  if (k.getUTCDay() !== 1 || k.getUTCHours() < 10) return 0
  const thisMonday = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600_000
  const from = new Date(thisMonday - 7 * 86_400_000), to = new Date(thisMonday)
  const week = new Date(thisMonday + 9 * 3600_000).toISOString().slice(0, 10)
  const rows = await db.select({ userId: rechargeGrants.userId,
    reward: sql<number>`coalesce(sum(${rechargeGrants.amount}) filter (where ${rechargeGrants.provider} <> ${CHEER_PROVIDER}), 0)::int`,
    cheer: sql<number>`coalesce(sum(${rechargeGrants.amount}) filter (where ${rechargeGrants.provider} = ${CHEER_PROVIDER}), 0)::int` })
    .from(rechargeGrants)
    .where(and(inArray(rechargeGrants.provider, [CREATOR_REWARD_PROVIDER, CREATOR_REWARD_FREE_PROVIDER, CHEER_PROVIDER]), sql`${rechargeGrants.status} = 'active'`,
      gte(rechargeGrants.createdAt, from), lt(rechargeGrants.createdAt, to)))
    .groupBy(rechargeGrants.userId)
  let sent = 0
  for (const r of rows) {
    const total = r.reward + r.cheer
    if (total <= 0) continue
    const [claimed] = await db.insert(opsAlerts).values({ key: `creator_digest:${week}:${r.userId}`, lastSentAt: now, detail: String(total) })
      .onConflictDoNothing().returning({ key: opsAlerts.key })
    if (!claimed) continue
    const parts = [r.reward ? `대화 보상 ${r.reward.toLocaleString('ko-KR')}` : '', r.cheer ? `응원 ${r.cheer.toLocaleString('ko-KR')}` : ''].filter(Boolean).join(' · ')
    await pushToUser(r.userId, { title: '지난주 창작 보상', body: `지난주에 ${total.toLocaleString('ko-KR')}토큰을 벌었어요 (${parts})`, url: '/earnings', tag: `creator-digest:${week}` }, now).catch(() => {})
    sent++
  }
  return sent
}
