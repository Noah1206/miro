import { deliverRealityPush } from './push-outbox'
import { maintainAI } from '@/lib/ai/maintenance'
import { reconcileStaleAIReservations } from '@/lib/ai/gateway'
import { eq, sql } from 'drizzle-orm'
import { POLICY, characterAgencyCohort, characterAgencyMode } from '@miro/config'
import { db, roleplaySessions } from '@miro/db'
import { evaluateSession, type EvaluateOutcome } from './evaluate'
import { expireCalls } from '@/lib/call/service'
import { purgeDeleted } from '@/lib/ops/archive'
import { purgeExpiredPersonalData } from '@/lib/ops/account'
import { expireSubscriptions } from '@/lib/payments/service'
import { notifyExpiringPasses } from '@/lib/payments/expiry-notice'
import { expireBankOrders, settleApprovedOrders } from '@/lib/payments/bank-transfer'
import { observe } from '@/lib/observe'
import { notifyOperators } from '@/lib/ops/alerts'
import { runMemoryJobs, type MemoryJobRun } from '@/lib/ai/memory-jobs'
import { advanceCharacterLife } from '@/lib/agency/life'
import { precompileAgencyRevisions } from '@/lib/agency/revisions'
import { AIUnavailableError } from '@miro/providers'

export type SchedulerRun = EvaluationRun & MaintenanceRun

export type EvaluationRun = {
  claimed: number
  results: Record<string, number>
  errors: number
}

export type MaintenanceRun = {
  ops: { alerts: number; sent: number }
  memoryJobs: MemoryJobRun
  calls: { missed: number; timedOut: number }
  purged: number
  expiredSubscriptions: number
  passNotices: { soon: number; ended: number }
  bankOrders: { settled: number; failed: number; expired: number }
  /** 이번 실행에서 실패한 정리 단계. 크론 응답(pg_net 기록)에 남는다. */
  failedSteps: string[]
}

/** 정리 단계 하나가 실패해도 나머지(특히 알림 발송·운영자 알림)는 돈다 — 전엔 앞 단계 하나가 던지면 알림이 무기한 멈췄다(10/2 감사). */
async function step<T>(failed: string[], name: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try { return await run() } catch (e) {
    failed.push(name)
    observe('reality.maintenance_step_failed', { step: name, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })
    return fallback
  }
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
  const failedSteps: string[] = []
  await step(failedSteps, 'ai_reservations', () => reconcileStaleAIReservations(wall), undefined)
  // 정리 작업은 벽시계로 돈다. `now` 는 판단 시각(활동 시간·Quiet Hours)만 바꾸는 값이며,
  // 생성 시각(실제 시각)과 비교하는 만료 판정에 섞이면 방금 만든 통화가 부재중이 된다.
  const calls = await step(failedSteps, 'calls', () => expireCalls(wall), { missed: 0, timedOut: 0 })
  const purged = await step(failedSteps, 'purge', () => purgeDeleted(wall), 0)   // 보존 기간이 지난 삭제 역할극 영구 삭제
  await step(failedSteps, 'purge_personal', () => purgeExpiredPersonalData(wall), undefined)   // 처리방침 3항: 삭제 계정 이메일·로그 1년
  // 만료 안내를 sweep 보다 먼저 보낸다. 순서가 바뀌면 status 가 expired 로 넘어가
  // 당일 안내 대상에서 빠진다 — 사용자는 끝났다는 사실만 화면에서 발견하게 된다.
  // 운영자가 승인한 계좌이체 주문을 지급한다. 승인과 지급을 나눠 지급 경로를 하나로 둔다.
  const settlement = await step(failedSteps, 'bank_settle', () => settleApprovedOrders(wall), { settled: 0, failed: 0 })
  const expiredOrders = await step(failedSteps, 'bank_expire', () => expireBankOrders(wall), 0)
  const bankOrders = { ...settlement, expired: expiredOrders }
  const passNotices = await step(failedSteps, 'pass_notices', () => notifyExpiringPasses(wall), { soon: 0, ended: 0 })
  const expiredSubscriptions = await step(failedSteps, 'subscriptions', () => expireSubscriptions(wall), 0)
  await step(failedSteps, 'ai_maintenance', () => maintainAI(wall), undefined)
  await step(failedSteps, 'push', () => deliverRealityPush(wall), 0)
  // 자율성을 켠 미로 캐릭터의 성격 규칙을 미리 정리한다 — 첫 대화의 첫 마디부터 그 사람이게(2026-10-02).
  await step(failedSteps, 'agency_revisions', () => precompileAgencyRevisions(), 0)
  // 응답 직후 시도가 유실된 기억 작업을 거둔다(임대 만료 포함).
  const memoryJobsRun = await runMemoryJobs(wall, { limit: 20 }).catch((e) => { observe('memory.jobs_sweep_failed', { error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }); return { claimed: 0, results: {} } })
  // 운영자 알림은 맨 끝에 — 위 작업이 남긴 기록까지 보고 판단한다. 알림 실패가 유지보수를 막지 않는다.
  const ops = await notifyOperators(wall).catch((e) => { observe('ops.alerts_failed', { error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }); return { alerts: 0, sent: 0 } })
  return { calls, purged, expiredSubscriptions, passNotices, bankOrders, ops, memoryJobs: memoryJobsRun, failedSteps }
}

/**
 * Wake a live cohort session at its goal's due time even before the usual idle gap. Only sessions
 * still listed in the cohort: the additive table is not referenced until a cohort exists, and a
 * session removed from the cohort stops waking.
 */
export function agencyDueCondition(now: Date) {
  const cohort = characterAgencyCohort()
  const ids = cohort.ids.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  if (characterAgencyMode() !== 'live') return sql`false`
  // 코호트 목록의 세션과, 정책 버전이 agency:v1 인 세션(§6) 둘 다 깨운다. 중단 스위치(mode≠live)면 어느 쪽도 아니다.
  const listed = cohort.all ? sql`true` : ids.length ? sql`ar.session_id IN (${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)})` : sql`false`
  return sql`EXISTS (
    SELECT 1 FROM character_runtime_states ar WHERE ar.session_id = s2.id AND ar.mode = 'live'
      AND ar.next_wake_at <= ${now.toISOString()}::timestamptz
      AND (${listed} OR s2.policy_version = 'agency:v1')
  )`
}

export async function runRealityEvaluations(now = new Date()): Promise<EvaluationRun> {
  const { idleMinutesBeforeContact, recheckMinutes, batchSize } = POLICY.reality
  const claimLimit = Math.min(batchSize, 10)

  const iso = (d: Date) => d.toISOString()
  const agencyDue = agencyDueCondition(now)
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
    // 자기 삶 먼저 — 대화가 없던 동안 겪은 일이 이번 판단(먼저 연락할지)의 근거가 된다. 실패해도 판단은 그대로 돈다.
    await advanceCharacterLife(row.id, now).catch((e) => observe('life.failed', { sessionId: row.id, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' }))
    try {
      const r: EvaluateOutcome = await evaluateSession(row.id, now, { background: true })
      const key = r.outcome === 'suppressed' ? `suppressed:${r.reason}` : r.outcome
      results[key] = (results[key] ?? 0) + 1
    } catch (e) {
      errors++
      if (e instanceof AIUnavailableError && e.attempts === 0 && e.last === 'provider_overloaded') {
        await db.execute(sql`UPDATE roleplay_sessions SET reality_checked_at = ${iso(new Date(now.getTime() - recheckMinutes * 60_000))}::timestamptz
          WHERE id = ${row.id} AND reality_checked_at = ${iso(now)}::timestamptz`)
      } else {
        await backOffFailing(row.id, now).catch(() => observe('reality.backoff_failed', { sessionId: row.id }))
      }
      observe('reality.job_failed', { sessionId: row.id, error: (e as Error).message })
    }
  }

  return { claimed: claimed.length, results, errors }
}

/**
 * 같은 세션이 계속 실패하면(검열에 막힘·생성 형식 오류) 간격을 늘린다 — 전엔 크론마다 다시 잡혀 검열 비용만 계속 냈다(10/2 감사).
 * 예약 의도는 실패 횟수를 세어 30분·1·2·4·6시간 뒤로 미루고, 답장이 아니면 세 번째 실패에 버린다(답장은 끝까지 다시 해 본다).
 * 의도 없이 실패했으면(사건·침묵 안부) 다음 판단을 두 시간쯤 뒤로 미룬다.
 */
export async function backOffFailing(sessionId: string, now: Date): Promise<void> {
  const [s] = await db.select({ pending: roleplaySessions.pendingRealityIntent }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).limit(1)
  const pending = s?.pending
  if (pending) {
    const failures = (pending.failures ?? 0) + 1
    const drop = !pending.answers && failures >= 3
    const delayMinutes = Math.min(6 * 60, 30 * 2 ** (failures - 1))
    await db.update(roleplaySessions)
      .set({ pendingRealityIntent: drop ? null : { ...pending, failures, notBefore: new Date(now.getTime() + delayMinutes * 60_000).toISOString() } })
      .where(eq(roleplaySessions.id, sessionId))
    if (drop) observe('reality.intent_dropped', { sessionId, reason: 'failures', stale: false })
    return
  }
  await db.update(roleplaySessions).set({ realityCheckedAt: new Date(now.getTime() + 90 * 60_000) }).where(eq(roleplaySessions.id, sessionId))
}

export async function runRealityScheduler(now = new Date(), wall = new Date()): Promise<SchedulerRun> {
  const maintenance = await runRealityMaintenance(wall)
  const evaluations = await runRealityEvaluations(now)
  return { ...evaluations, ...maintenance }
}
