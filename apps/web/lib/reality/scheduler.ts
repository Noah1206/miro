import { deliverRealityPush } from './push-outbox'
import { maintainAI } from '@/lib/ai/maintenance'
import { reconcileStaleAIReservations } from '@/lib/ai/gateway'
import { sql } from 'drizzle-orm'
import { POLICY, characterAgencyMode } from '@miro/config'
import { db } from '@miro/db'
import { evaluateSession, type EvaluateOutcome } from './evaluate'
import { expireCalls } from '@/lib/call/service'
import { purgeDeleted } from '@/lib/ops/archive'
import { expireSubscriptions } from '@/lib/payments/service'
import { notifyExpiringPasses } from '@/lib/payments/expiry-notice'
import { expireBankOrders, settleApprovedOrders } from '@/lib/payments/bank-transfer'
import { observe } from '@/lib/observe'
import { AIUnavailableError } from '@miro/providers'

export type SchedulerRun = EvaluationRun & MaintenanceRun

export type EvaluationRun = {
  claimed: number
  results: Record<string, number>
  errors: number
}

export type MaintenanceRun = {
  calls: { missed: number; timedOut: number }
  purged: number
  expiredSubscriptions: number
  passNotices: { soon: number; ended: number }
  bankOrders: { settled: number; failed: number; expired: number }
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
export async function runRealityMaintenance(wall = new Date()): Promise<MaintenanceRun> {
  await reconcileStaleAIReservations(wall)
  // 정리 작업은 벽시계로 돈다. `now` 는 판단 시각(활동 시간·Quiet Hours)만 바꾸는 값이며,
  // 생성 시각(실제 시각)과 비교하는 만료 판정에 섞이면 방금 만든 통화가 부재중이 된다.
  const calls = await expireCalls(wall)
  const purged = await purgeDeleted(wall)   // 보존 기간이 지난 삭제 역할극 영구 삭제
  // 만료 안내를 sweep 보다 먼저 보낸다. 순서가 바뀌면 status 가 expired 로 넘어가
  // 당일 안내 대상에서 빠진다 — 사용자는 끝났다는 사실만 화면에서 발견하게 된다.
  // 운영자가 승인한 계좌이체 주문을 지급한다. 승인과 지급을 나눠 지급 경로를 하나로 둔다.
  const settlement = await settleApprovedOrders(wall)
  const expiredOrders = await expireBankOrders(wall)
  const bankOrders = { ...settlement, expired: expiredOrders }
  const passNotices = await notifyExpiringPasses(wall)
  const expiredSubscriptions = await expireSubscriptions(wall)
  await maintainAI(wall)
  await deliverRealityPush(wall)
  return { calls, purged, expiredSubscriptions, passNotices, bankOrders }
}

export async function runRealityEvaluations(now = new Date()): Promise<EvaluationRun> {
  const { idleMinutesBeforeContact, recheckMinutes, batchSize } = POLICY.reality
  const claimLimit = Math.min(batchSize, 10)

  const iso = (d: Date) => d.toISOString()
  // Do not reference additive tables until the deployment explicitly opts into the new runtime.
  const agencyDue = characterAgencyMode() === 'live' ? sql`EXISTS (
    SELECT 1 FROM character_runtime_states ar WHERE ar.session_id = s2.id AND ar.mode = 'live'
      AND ar.next_wake_at <= ${iso(now)}::timestamptz
  )` : sql`false`
  const claimed = await db.execute<{ id: string }>(sql`
    WITH picked AS MATERIALIZED (
       SELECT s2.id
         FROM roleplay_sessions s2
         JOIN users u ON u.id = s2.user_id AND u.deleted_at IS NULL
         -- 홈의 일반 캐릭터는 후보에서 빠진다. evaluateSession 이 한 번 더 보지만, 매 주기 헛도는 claim 은 여기서 막는다.
         JOIN characters c ON c.id = s2.character_id AND c.experience_type = 'reality' AND c.deleted_at IS NULL
         JOIN contact_profiles cp ON cp.character_id = c.id AND cp.enabled = true
        WHERE s2.status = 'active'
          AND s2.deleted_at IS NULL
          AND s2.restricted_at IS NULL
          AND (s2.last_interaction_at < ${iso(new Date(now.getTime() - idleMinutesBeforeContact * 60_000))}::timestamptz
               OR (s2.pending_reality_intent->>'notBefore') IS NOT NULL OR ${agencyDue})
          AND ((s2.pending_reality_intent->>'notBefore') IS NULL
               OR (s2.pending_reality_intent->>'notBefore')::timestamptz <= ${iso(now)}::timestamptz OR ${agencyDue})
          AND (s2.reality_checked_at IS NULL
               OR s2.reality_checked_at < ${iso(new Date(now.getTime() - recheckMinutes * 60_000))}::timestamptz
               OR (s2.pending_reality_intent->>'notBefore')::timestamptz <= ${iso(now)}::timestamptz)
        ORDER BY coalesce(s2.reality_checked_at, s2.last_interaction_at), s2.id
        LIMIT ${claimLimit}
          FOR UPDATE OF s2 SKIP LOCKED
     )
    UPDATE roleplay_sessions s
       SET reality_checked_at = ${iso(now)}::timestamptz
      FROM picked
     WHERE s.id = picked.id
     RETURNING s.id
  `)

  const results: Record<string, number> = {}
  let errors = 0

  for (const row of claimed) {
    try {
      const r: EvaluateOutcome = await evaluateSession(row.id, now, { background: true })
      const key = r.outcome === 'suppressed' ? `suppressed:${r.reason}` : r.outcome
      results[key] = (results[key] ?? 0) + 1
    } catch (e) {
      errors++
      if (e instanceof AIUnavailableError && e.attempts === 0 && e.last === 'provider_overloaded') {
        await db.execute(sql`UPDATE roleplay_sessions SET reality_checked_at = ${iso(new Date(now.getTime() - recheckMinutes * 60_000))}::timestamptz
          WHERE id = ${row.id} AND reality_checked_at = ${iso(now)}::timestamptz`)
      }
      observe('reality.job_failed', { sessionId: row.id, error: (e as Error).message })
    }
  }

  return { claimed: claimed.length, results, errors }
}

export async function runRealityScheduler(now = new Date(), wall = new Date()): Promise<SchedulerRun> {
  const maintenance = await runRealityMaintenance(wall)
  const evaluations = await runRealityEvaluations(now)
  return { ...evaluations, ...maintenance }
}
