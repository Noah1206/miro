import { desc, eq } from 'drizzle-orm'
import { db, stateTransitions } from '@miro/db'

/**
 * 한 세션의 "왜 바뀌었나" 내부 조회(§3.4). 대시보드가 아니다 — 운영자·테스트가 변경 필드와 근거를 확인하는 작은 조회.
 * 원장 행만 돌려준다. 메시지 원문은 여기 없다.
 */
export async function explainSession(sessionId: string, opts: { limit?: number; field?: string } = {}) {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50))
  const rows = await db.select().from(stateTransitions).where(eq(stateTransitions.sessionId, sessionId))
    .orderBy(desc(stateTransitions.createdAt), desc(stateTransitions.seq)).limit(limit * 4)
  return rows.filter(r => !opts.field || r.field === opts.field || r.field.startsWith(opts.field + '.')).slice(0, limit)
    .map(r => ({ at: r.createdAt, trigger: r.triggerKey, engine: r.engine, policy: r.policyVersion, field: r.field, before: r.before, after: r.after,
      rule: r.rule, status: r.status, clock: r.clock, actor: r.actor, decisionId: r.decisionId, cause: r.causeMessageId, outcome: r.outcomeRef,
      versions: { world: r.worldVersion, relationship: r.relationshipVersion, runtime: r.runtimeVersion } }))
}
