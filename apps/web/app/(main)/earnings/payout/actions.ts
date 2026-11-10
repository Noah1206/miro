'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'

export type PayoutState = { ok: boolean; error: string | null; requestId: string }

/** 출금 신청 — 동의 두 개가 없으면 받지 않는다. requestId 가 같으면 한 번만 처리된다. */
export async function submitPayout(prev: PayoutState, form: FormData): Promise<PayoutState> {
  const user = await requireUser()
  const { requestPayout, PayoutError } = await import('@/lib/usage/creator-payout')
  const fail = (error: string): PayoutState => ({ ok: false, error, requestId: prev.requestId })
  if (form.get('agreePrivacy') !== 'on' || form.get('agreeRrn') !== 'on') return fail('agree')
  try {
    await requestPayout({ userId: user.id, tokens: Number(form.get('tokens')), realName: String(form.get('realName') ?? ''), rrn: String(form.get('rrn') ?? ''),
      bank: String(form.get('bank') ?? ''), accountNumber: String(form.get('accountNumber') ?? ''), requestId: prev.requestId })
  } catch (e) {
    if (e instanceof PayoutError) return fail(e.message)
    throw e
  }
  revalidatePath('/earnings', 'layout')
  return { ok: true, error: null, requestId: crypto.randomUUID() }
}
