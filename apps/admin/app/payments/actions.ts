'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { approveBankOrder, rejectBankOrder } from '@/lib/payments'

export type PayState = { message: string | null; ok: boolean }

/**
 * 입금 승인. 실제로 통장에 들어온 것을 확인한 뒤에만 누른다 — 이 버튼이 지급을 일으킨다.
 * 권한은 payments.act (superadmin) 이며, 동시에 눌러도 지급은 한 번이다.
 */
export async function approve(_p: PayState, form: FormData): Promise<PayState> {
  let admin
  try { admin = await requireAdmin('payments.act') } catch { return { ok: false, message: '입금 승인 권한이 없습니다.' } }
  const orderId = String(form.get('orderId') ?? '')
  const r = await approveBankOrder(admin.id, orderId, String(form.get('note') ?? ''))
  revalidatePath('/payments')
  // 지급은 web 앱의 cron 이 곧 처리한다 — 승인은 그 예약이다.
  if (r === 'approved') return { ok: true, message: '승인했습니다. 잠시 후 지급에 반영됩니다.' }
  return { ok: false, message: '이미 처리되었거나 만료된 주문입니다.' }
}

/** 입금이 확인되지 않은 주문 거절. 근거를 남겨야 한다. */
export async function reject(_p: PayState, form: FormData): Promise<PayState> {
  let admin
  try { admin = await requireAdmin('payments.act') } catch { return { ok: false, message: '입금 승인 권한이 없습니다.' } }
  const orderId = String(form.get('orderId') ?? '')
  const note = String(form.get('note') ?? '')
  if (!note.trim()) return { ok: false, message: '거절 사유를 적어 주세요.' }
  const r = await rejectBankOrder(admin.id, orderId, note)
  revalidatePath('/payments')
  return r === 'rejected' ? { ok: true, message: '거절했습니다.' } : { ok: false, message: '이미 처리된 주문입니다.' }
}
