'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'

/** 수익 → 지갑 옮기기. 같은 requestId 는 한 번만 처리된다. */
export async function moveToWallet(amount: number, requestId: string): Promise<{ ok: true; wallet: number } | { ok: false; reason: 'over' | 'invalid' }> {
  const user = await requireUser()
  const { transferToWallet, PayoutError } = await import('@/lib/usage/creator-payout')
  const { usageStatus } = await import('@/lib/usage/guard')
  try {
    await transferToWallet({ userId: user.id, amount, requestId })
  } catch (e) {
    if (e instanceof PayoutError) return { ok: false, reason: e.message === 'over_withdrawable' ? 'over' : 'invalid' }
    throw e
  }
  revalidatePath('/earnings', 'layout')
  const s = await usageStatus(user.id)
  return { ok: true, wallet: s.remaining + s.rechargeRemaining }
}
