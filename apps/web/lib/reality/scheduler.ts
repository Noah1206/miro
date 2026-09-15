import { maintainAI } from '@/lib/ai/maintenance'
import { sql } from 'drizzle-orm'
import { POLICY } from '@miro/config'
import { db } from '@miro/db'
import { evaluateSession, type EvaluateOutcome } from './evaluate'
import { expireCalls } from '@/lib/call/service'
import { purgeDeleted } from '@/lib/ops/archive'
import { expireSubscriptions } from '@/lib/payments/service'
import { observe } from '@/lib/observe'

export type SchedulerRun = {
  claimed: number
  results: Record<string, number>
  errors: number
  calls: { missed: number; timedOut: number }
  purged: number
  expiredSubscriptions: number
}

/**
 * "지금 다시 판단해볼 시점인 세션" 을 고른다.
 *
 * 다음 스토리 이벤트를 예약하는 것이 아니다. 조건은 전부 "판단할 가치가 있는가" 이고,
 * 실제 발송 여부는 evaluateSession 이 현재 상태로 정한다.
 *
 * ponytail: 단일 UPDATE … SKIP LOCKED 로 claim. 워커가 여럿이어도 같은 세션을 두 번 잡지 않는다.
 * 세션이 수십만 건이 되면 realityCheckedAt 에 부분 인덱스를 추가한다.
 */
export async function runRealityScheduler(now = new Date(), wall = new Date()): Promise<SchedulerRun> {
  const { idleMinutesBeforeContact, recheckMinutes, batchSize } = POLICY.reality

  const iso = (d: Date) => d.toISOString()
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE roleplay_sessions s
       SET reality_checked_at = ${iso(now)}::timestamptz
     WHERE s.id IN (
       SELECT s2.id
         FROM roleplay_sessions s2
         JOIN users u ON u.id = s2.user_id AND u.deleted_at IS NULL
        WHERE s2.status = 'active'
          AND s2.deleted_at IS NULL
          AND (s2.last_interaction_at < ${iso(new Date(now.getTime() - idleMinutesBeforeContact * 60_000))}::timestamptz
               OR (s2.pending_reality_intent->>'notBefore') IS NOT NULL)
          AND ((s2.pending_reality_intent->>'notBefore') IS NULL
               OR (s2.pending_reality_intent->>'notBefore')::timestamptz <= ${iso(now)}::timestamptz)
          AND (s2.reality_checked_at IS NULL
               OR s2.reality_checked_at < ${iso(new Date(now.getTime() - recheckMinutes * 60_000))}::timestamptz
               OR (s2.pending_reality_intent->>'notBefore')::timestamptz <= ${iso(now)}::timestamptz)
        ORDER BY s2.reality_checked_at NULLS FIRST
        LIMIT ${batchSize}
          FOR UPDATE SKIP LOCKED
     )
     RETURNING s.id
  `)

  const results: Record<string, number> = {}
  let errors = 0

  for (const row of claimed) {
    try {
      const r: EvaluateOutcome = await evaluateSession(row.id, now)
      const key = r.outcome === 'suppressed' ? `suppressed:${r.reason}` : r.outcome
      results[key] = (results[key] ?? 0) + 1
    } catch (e) {
      errors++
      observe('reality.job_failed', { sessionId: row.id, error: (e as Error).message })
    }
  }

  // 정리 작업은 벽시계로 돈다. `now` 는 판단 시각(활동 시간·Quiet Hours)만 바꾸는 값이며,
  // 생성 시각(실제 시각)과 비교하는 만료 판정에 섞이면 방금 만든 통화가 부재중이 된다.
  const calls = await expireCalls(wall)
  const purged = await purgeDeleted(wall)   // 보존 기간이 지난 삭제 역할극 영구 삭제
  const expiredSubscriptions = await expireSubscriptions(wall)
  await maintainAI(wall)
  return { claimed: claimed.length, results, errors, calls, purged, expiredSubscriptions }
}
