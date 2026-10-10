import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { walletSnapshot } from '@/lib/wallet/service'
import { Page, PageHeader } from '@/components/ui'
import { Wallet } from '@/components/wallet/wallet'
import { getT } from '@/lib/i18n/server'

export default async function SubscriptionPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [wallet, t] = await Promise.all([walletSnapshot(user.id), getT()])
  return <Page style={{ maxWidth: 480 }}>
    <PageHeader back="/my" title={t('토큰 사용 내역')} />
    <Wallet initial={wallet} />
  </Page>
}
