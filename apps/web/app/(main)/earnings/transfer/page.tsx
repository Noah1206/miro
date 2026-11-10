import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { withdrawableTokens } from '@/lib/usage/creator-payout'
import { TransferFlow } from './flow'

/** 수익 → 지갑 옮기기 — 토스 이체 흐름(금액 키패드 → 확인 → 완료). */
export default async function TransferPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  return <TransferFlow balance={await withdrawableTokens(user.id)} />
}
