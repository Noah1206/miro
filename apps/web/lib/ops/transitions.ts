import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { db, roleplaySessions, stateTransitions } from '@miro/db'

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

/**
 * 세션 정책 전환(§6.3·§6.4). 값만 바꾸고 전환 표시를 원장에 남긴다 — 관계·세계·대화·자율성 상태는 지우지 않는다.
 * legacy 로 돌아가도 characterRuntimeStates 는 보존된다(정지). 다시 agency 로 갈 때 그동안 쌓인 메시지는 근거로 다시 읽힌다.
 */
export async function switchSessionPolicy(sessionId: string, version: 'legacy:v1' | 'agency:v1', reason: string): Promise<boolean> {
  return db.transaction(async tx => {
    const [session] = await tx.select({ policyVersion: roleplaySessions.policyVersion }).from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).for('update')
    if (!session || session.policyVersion === version) return false
    await tx.update(roleplaySessions).set({ policyVersion: version }).where(eq(roleplaySessions.id, sessionId))
    await tx.insert(stateTransitions).values({ sessionId, triggerKey: `policy:${randomUUID()}`, seq: 0, policyVersion: 'turn-policy:v1',
      engine: version === 'agency:v1' ? 'agency' : 'legacy', actor: 'operator', field: 'session.policyVersion', before: session.policyVersion, after: version,
      rule: 'policy_switch', status: 'applied', clock: 'real', outcomeRef: reason.slice(0, 120) })
    return true
  })
}
