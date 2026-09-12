import { redirect } from 'next/navigation'
import { currentUser, requireUser } from '@/lib/auth'
import { cancelSubscription, subscriptionStatus } from '@/lib/payments/service'
import { Button, Page, PageHeader, TransitionLink } from '@/components/ui'

async function cancel() { 'use server'; const u = await requireUser(); await cancelSubscription(u.id); redirect('/my/subscription') }

export default async function SubscriptionPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const s = await subscriptionStatus(user.id)
  const fmt = (d: Date) => d.toLocaleDateString('ko-KR')
  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back="/my" title="구독" />
      {!s ? (
        <p data-sub-status="none" className="t-body" style={{ color: 'var(--color-text-secondary)' }}>구독이 없습니다. <TransitionLink href="/plans" style={{ textDecoration: 'underline', color: 'var(--color-text-primary)' }}>요금제 보기</TransitionLink></p>
      ) : (
        <section data-sub-status={s.status} style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }} className="stack">
          <p className="t-title-3">MIRO Pro {s.entitled ? '' : <span className="t-caption">(만료)</span>}</p>
          <p className="t-caption" style={{ marginTop: 6 }}>{s.renewalStatus === 'auto' ? '자동 갱신' : '해지됨 — 갱신되지 않음'}</p>
          <p className="t-caption">현재 기간 {fmt(s.currentPeriodStart)} ~ {fmt(s.currentPeriodEnd)}</p>
          {s.status === 'cancelled' && s.entitled && <p data-keeps-until className="t-body" style={{ marginTop: 10 }}>Pro 자격은 {fmt(s.currentPeriodEnd)}까지 유지됩니다.</p>}
          {s.status === 'active' && <form action={cancel} style={{ marginTop: 16 }}><Button type="submit" variant="danger" size="sm">구독 해지</Button></form>}
          {s.status === 'expired' && <TransitionLink href="/subscribe" className="t-caption" style={{ marginTop: 12, textDecoration: 'underline' }}>다시 구독</TransitionLink>}
        </section>
      )}
    </Page>
  )
}
