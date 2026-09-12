import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { db, adminActions, adminUsers, characters, messages, reports, roleplaySessions, users } from '@miro/db'
import { nextStatus, requiresNote, type ReportAction, type ReportStatus } from '@miro/domain'

export async function listReports(status: ReportStatus | 'all') {
  return db.select({
    id: reports.id, status: reports.status, reason: reports.reason, targetType: reports.targetType,
    createdAt: reports.createdAt, characterName: characters.name,
  })
    .from(reports).leftJoin(characters, eq(characters.id, reports.characterId))
    .where(status === 'all' ? undefined : eq(reports.status, status))
    .orderBy(desc(reports.createdAt)).limit(200)
}

/** 검토에 필요한 범위의 맥락: 신고 대상 앞뒤 몇 턴. 관계 수치는 포함하지 않는다. */
export async function reportDetail(id: string) {
  const [r] = await db.select({ report: reports, characterName: characters.name, reporterEmail: users.email })
    .from(reports).leftJoin(characters, eq(characters.id, reports.characterId)).leftJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.id, id)).limit(1)
  if (!r) return null

  const turn = Number((r.report.targetSnapshot as { turnIndex?: number }).turnIndex ?? 0)
  const context = r.report.sessionId ? await db.select({ id: messages.id, role: messages.role, kind: messages.kind, content: messages.content, turnIndex: messages.turnIndex, hiddenAt: messages.hiddenAt })
    .from(messages).where(and(eq(messages.sessionId, r.report.sessionId), gte(messages.turnIndex, Math.max(0, turn - 2)), lte(messages.turnIndex, turn + 1)))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt)) : []

  const [session] = r.report.sessionId ? await db.select({ restrictedAt: roleplaySessions.restrictedAt }).from(roleplaySessions).where(eq(roleplaySessions.id, r.report.sessionId)).limit(1) : []
  const history = await db.select({ action: adminActions.action, note: adminActions.note, createdAt: adminActions.createdAt, email: adminUsers.email, from: adminActions.previousStatus, to: adminActions.newStatus })
    .from(adminActions).innerJoin(adminUsers, eq(adminUsers.id, adminActions.adminId))
    .where(eq(adminActions.reportId, id)).orderBy(asc(adminActions.createdAt))

  return { ...r, context, sessionRestricted: !!session?.restrictedAt, history }
}

export type ActResult = 'ok' | 'stale' | 'invalid_transition' | 'note_required' | 'not_found'

/**
 * 조치 확정. 낙관적 잠금(version)으로 동시 처리를 막고, 조치·상태 전이·감사 로그를 한 트랜잭션으로 남긴다.
 * 제한 조치는 대상 콘텐츠(숨김) 또는 역할극 경험(제한)에 적용된다 (명세서 9.2).
 */
export async function act(adminId: string, reportId: string, expectedVersion: number, action: ReportAction, note: string): Promise<ActResult> {
  if (requiresNote(action) && note.trim().length < 3) return 'note_required'
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(reports).where(eq(reports.id, reportId)).limit(1)
    if (!r) return 'not_found'
    if (r.version !== expectedVersion) return 'stale'
    const to = nextStatus(r.status, action)
    if (!to) return 'invalid_transition'

    const updated = await tx.update(reports)
      .set({ status: to, version: r.version + 1, reviewedBy: adminId, reviewedAt: new Date(), resolution: note || r.resolution })
      .where(and(eq(reports.id, reportId), eq(reports.version, expectedVersion)))
      .returning({ id: reports.id })
    if (updated.length === 0) return 'stale'

    if (action === 'hide_content' && r.targetType !== 'live_scene') {
      await tx.update(messages).set({ hiddenAt: new Date() }).where(eq(messages.id, r.targetId))
    }
    if (action === 'restrict_session' && r.sessionId) {
      await tx.update(roleplaySessions).set({ restrictedAt: new Date(), restrictedReason: note }).where(eq(roleplaySessions.id, r.sessionId))
    }
    if (action === 'reopen' && r.sessionId) {
      // 재검토 시 제한을 자동 해제하지는 않는다 — 명시적 조치가 필요하다.
    }
    await tx.insert(adminActions).values({ adminId, reportId, action, previousStatus: r.status, newStatus: to, note })
    return 'ok'
  })
}

export async function auditLog() {
  return db.select({ id: adminActions.id, action: adminActions.action, note: adminActions.note, createdAt: adminActions.createdAt, email: adminUsers.email, reportId: adminActions.reportId, from: adminActions.previousStatus, to: adminActions.newStatus })
    .from(adminActions).innerJoin(adminUsers, eq(adminUsers.id, adminActions.adminId))
    .orderBy(desc(adminActions.createdAt)).limit(300)
}
