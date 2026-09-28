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
  rechargeRemaining: number; monthlyRemaining: number; available: number
  plan: 'free' | 'pro'; resetsAt: string | null
  account: BankAccount | null; products: RechargeProduct[]
  order: WalletOrder | null; history: WalletHistory
}
export type BalanceActionResult =
  | { status: 'success' }
  | { status: 'insufficient' }
  | { status: 'failed'; error: string }
export type PayState = 'idle' | 'loading' | 'success' | 'failed' | 'cancelled'
