export type AdminRole = 'viewer' | 'reviewer' | 'superadmin'
export type AdminPermission = 'reports.view' | 'reports.review' | 'reports.act' | 'audit.view' | 'admins.manage'

const GRANTS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  viewer: new Set(['reports.view', 'audit.view']),
  reviewer: new Set(['reports.view', 'reports.review', 'reports.act', 'audit.view']),
  superadmin: new Set(['reports.view', 'reports.review', 'reports.act', 'audit.view', 'admins.manage']),
}

/** 역할 → 권한. 화면과 액션 양쪽이 같은 표를 본다. */
export function can(role: AdminRole, permission: AdminPermission): boolean {
  return GRANTS[role].has(permission)
}

export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed'
export type ReportAction = 'start_review' | 'hide_content' | 'restrict_session' | 'resolve_no_action' | 'dismiss' | 'reopen'

/** 허용되는 상태 전이. 처리된 신고를 다시 열 때만 reopen 이 가능하다 (명세서 9.2 예외). */
const TRANSITIONS: Record<ReportAction, { from: ReportStatus[]; to: ReportStatus }> = {
  start_review: { from: ['pending'], to: 'reviewing' },
  hide_content: { from: ['pending', 'reviewing'], to: 'resolved' },
  restrict_session: { from: ['pending', 'reviewing'], to: 'resolved' },
  resolve_no_action: { from: ['pending', 'reviewing'], to: 'resolved' },
  dismiss: { from: ['pending', 'reviewing'], to: 'dismissed' },
  reopen: { from: ['resolved', 'dismissed'], to: 'reviewing' },
}

export function nextStatus(current: ReportStatus, action: ReportAction): ReportStatus | null {
  const t = TRANSITIONS[action]
  return t.from.includes(current) ? t.to : null
}

/** 제한 조치(hide/restrict)는 정책 위반이 확인된 경우에만 — 근거 메모가 필요하다. */
export function requiresNote(action: ReportAction): boolean {
  return action === 'hide_content' || action === 'restrict_session'
}
