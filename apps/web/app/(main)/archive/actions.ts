'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { setArchived, softDelete } from '@/lib/ops/archive'

export async function archive(sessionId: string) {
  const u = await requireUser(); await setArchived(u.id, sessionId, true); revalidatePath('/archive')
}
export async function restore(sessionId: string) {
  const u = await requireUser(); await setArchived(u.id, sessionId, false); revalidatePath('/archive')
}
/** n50 — 삭제 확정. 동일 요청 반복은 이미 처리된 상태로 응답한다. */
export async function confirmDelete(sessionId: string) {
  const u = await requireUser()
  await softDelete(u.id, sessionId)
  redirect('/archive?deleted=1')
}
