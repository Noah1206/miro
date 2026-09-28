import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { walletSnapshot } from '@/lib/wallet/service'
import { Page, PageHeader } from '@/components/ui'
import { Wallet } from '@/components/wallet/wallet'

export const dynamic = 'force-dynamic'

export default async function RechargePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { order } = await searchParams
  const wallet = await walletSnapshot(user.id)
  return <Page style={{ maxWidth: 480 }}>
    <PageHeader back="/my/subscription" title="Miro Pay" />
    <Wallet initial={wallet} showOrder={!!order} />
  </Page>
}
