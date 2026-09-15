import { redirect } from 'next/navigation'
import { POLICY, productionRuntime } from '@miro/config'
import { resolvePayment } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { effectivePlan } from '@/lib/usage/guard'
import { Button, Notice, Page, PageHeader, Reveal } from '@/components/ui'
import { beginCheckout, restore, simulateOutcome } from './actions'

// Runtime environment and account state must never be frozen into a build-time redirect.
export const dynamic = 'force-dynamic'

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  if (productionRuntime()) redirect('/plans')
  const user = await currentUser()
  if (!user) redirect('/login')
  if ((await effectivePlan(user.id)) === 'pro') redirect('/my/subscription')
  const { checkout } = await searchParams
  const provider = resolvePayment()
  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back="/plans" title="MIRO Pro" lead="같은 기능과 품질, 더 넉넉한 월간 사용량. 자동 갱신은 없어요." />
      <p className="t-body" style={{ marginBottom: 16 }}>1개월 이용권: <b>{POLICY.subscription.priceLabel}</b> <span className="t-caption">(판매 준비 중)</span></p>
      <p className="t-caption" style={{ marginBottom: 16, color: 'var(--color-text-secondary)' }}>30일 뒤 자동으로 끝나요. 자동 결제되지 않고, 끝나기 전에 알려드릴게요.</p>
      {provider.info.notice && <Notice style={{ marginBottom: 16 }}>⚠ {provider.info.notice}</Notice>}
      {!checkout ? (
        <Reveal>
          <form action={beginCheckout}><Button type="submit" variant="primary" size="lg" full data-checkout>Pro 이용권 받기</Button></form>
          <form action={restore} style={{ marginTop: 14, textAlign: 'center' }}><Button type="submit" variant="ghost" size="sm">이전 구매 복원</Button></form>
        </Reveal>
      ) : (
        <Reveal>
          <section data-mock-checkout style={{ padding: 18, background: 'var(--color-surface-1)', border: '1px dashed var(--color-border-strong)', borderRadius: 'var(--radius-lg)' }}>
            <p className="t-caption" style={{ marginBottom: 14 }}>결제 시뮬레이션 — 실제 PG 에서는 결제창으로 이동하고 결과는 webhook 으로 들어옵니다.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <form action={simulateOutcome.bind(null, checkout, 'success')} style={{ flex: 1 }}><Button type="submit" variant="primary" full>결제 성공</Button></form>
              <form action={simulateOutcome.bind(null, checkout, 'failed')} style={{ flex: 1 }}><Button type="submit" variant="danger" full>결제 실패</Button></form>
            </div>
          </section>
        </Reveal>
      )}
    </Page>
  )
}
