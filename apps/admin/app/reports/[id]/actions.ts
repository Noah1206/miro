'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { act } from '@/lib/reports'
import type { ReportAction } from '@miro/domain'

export type ActState = { message: string | null; ok: boolean }
const MESSAGES: Record<string, string> = {
  ok: '조치가 적용되었습니다.', stale: '다른 운영자가 먼저 처리했습니다. 최신 상태를 확인하세요.',
  invalid_transition: '현재 상태에서는 할 수 없는 조치입니다.', note_required: '제한 조치에는 정책 위반 근거 메모가 필요합니다.', not_found: '신고를 찾을 수 없습니다.',
}
/** n77 — 조치 확정. 권한이 없으면 실행되지 않는다. */
export async function applyAction(_p: ActState, form: FormData): Promise<ActState> {
  let admin
  try { admin = await requireAdmin('reports.act') } catch { return { ok: false, message: '조치 권한이 없습니다.' } }
  const reportId = String(form.get('reportId') ?? '')
  const r = await act(admin.id, reportId, Number(form.get('version')), form.get('action') as ReportAction, String(form.get('note') ?? ''))
  revalidatePath(`/reports/${reportId}`)
  return { ok: r === 'ok', message: MESSAGES[r] ?? r }
}
