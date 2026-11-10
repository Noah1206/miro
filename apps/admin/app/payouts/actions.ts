'use server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { markPayoutPaid, rejectPayout } from '@/lib/payouts'

export type PayoutActionState = { message: string | null; ok: boolean }

/** 통장에서 송금을 마친 뒤 누른다 — 되돌리지 않는다. */
export async function paid(_p: PayoutActionState, form: FormData): Promise<PayoutActionState> {
  let admin
  try { admin = await requireAdmin('payments.act') } catch { return { ok: false, message: '권한이 없습니다.' } }
  const r = await markPayoutPaid(admin.id, String(form.get('id') ?? ''), String(form.get('note') ?? ''))
  revalidatePath('/payouts')
  return r === 'paid' ? { ok: true, message: '송금 완료로 표시했습니다.' } : { ok: false, message: '이미 처리된 신청입니다.' }
}

/** 반려 — 토큰을 돌려준다. 사유는 사용자 신청 내역에 보인다. */
export async function reject(_p: PayoutActionState, form: FormData): Promise<PayoutActionState> {
  let admin
  try { admin = await requireAdmin('payments.act') } catch { return { ok: false, message: '권한이 없습니다.' } }
  const note = String(form.get('note') ?? '').trim()
  if (!note) return { ok: false, message: '반려 사유를 적어 주세요(사용자에게 보입니다).' }
  const r = await rejectPayout(admin.id, String(form.get('id') ?? ''), note)
  revalidatePath('/payouts')
  return r === 'rejected' ? { ok: true, message: '반려하고 토큰을 돌려줬습니다.' } : { ok: false, message: '이미 처리된 신청입니다.' }
}
