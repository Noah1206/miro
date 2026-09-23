'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { listSessions, softDelete, type ArchiveCursor } from '@/lib/ops/archive'
import { track } from '@/lib/analytics/track'

export async function loadArchivePage(query: string, cursor?: ArchiveCursor | null) {
  const user = await requireUser()
  return listSessions(user.id, { query, cursor })
}

/** n50 — 삭제 확정. 동일 요청 반복은 이미 처리된 상태로 응답한다. */
export async function confirmDelete(sessionId: string) {
  const u = await requireUser()
  const r = await softDelete(u.id, sessionId)
  if (r === 'deleted') void track(u.id, 'session_deleted', { sessionId })
  revalidatePath('/archive')
  redirect('/archive?deleted=1')
}
