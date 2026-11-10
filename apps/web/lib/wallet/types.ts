import type { BankAccount, RechargeProduct } from '@miro/config'

export type WalletOrder = {
  id: string; kind: 'pass' | 'recharge'; status: 'awaiting' | 'approved' | 'rejected' | 'expired'
  amountMinor: number; currency: string; units: number | null; depositName: string
  expiresAt: string; settledAt: string | null
}
export type WalletEntry = {
  id: string; at: string; label: string; amount: number | null; detail: string; status: string
}
export type WalletHistory = { entries: WalletEntry[]; cursor: string | null }
export type WalletSnapshot = {
  /** Server read identity/time keep cached route props from replacing a newer balance. */
  userId: string; observedAt: number
  rechargeRemaining: number; monthlyRemaining: number; available: number
  /** 수익 지갑(창작 보상·응원) — available 에 들어가지 않는다. 화면용이라 없을 수 있다(잔액 새로고침 응답). */
  earnings?: number
  plan: 'free' | 'pro'; resetsAt: string | null
  account: BankAccount | null; products: RechargeProduct[]
  order: WalletOrder | null; history: WalletHistory
}
export type BalanceActionResult =
  | { status: 'success' }
  | { status: 'insufficient' }
  | { status: 'failed'; error: string }
export type PayState = 'idle' | 'loading' | 'success' | 'failed' | 'cancelled'
