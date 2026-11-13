import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { walletSnapshot } from '@/lib/wallet/service'
import { Notice, Page, PageHeader } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { Wallet } from '@/components/wallet/wallet'

export const dynamic = 'force-dynamic'

/** 11/13 모바일 카드 결제가 돌아온 뒤 결과(card/return 이 붙인다). */
const CARD_RESULT: Record<string, [string, 'danger' | undefined]> = {
  paid: ['카드 결제가 완료됐어요. 잔액에 반영했습니다.', undefined],
  pending: ['결제를 확인하고 있어요. 잠시 후 잔액에 반영돼요.', undefined],
  closed: ['결제를 마치지 않았어요.', 'danger'],
  failed: ['결제가 완료되지 않았어요. 카드에서 빠져나간 금액이 있으면 자동으로 취소돼요.', 'danger'],
}

export default async function RechargePage({ searchParams }: { searchParams: Promise<{ order?: string; card?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { order, card } = await searchParams
  const [wallet, t] = await Promise.all([walletSnapshot(user.id), getT()])
  const result = card ? CARD_RESULT[card] : undefined
  return <Page style={{ maxWidth: 480 }}>
    <PageHeader back="/my/subscription" title="Miro Pay" />
    {result && <Notice tone={result[1]} role={result[1] ? 'alert' : 'status'}>{t(result[0])}</Notice>}
    <Wallet initial={wallet} showOrder={!!order} />
  </Page>
}
