import { redirect } from 'next/navigation'
import { currentUser, requireUser } from '@/lib/auth'
import { cancelSubscription, subscriptionStatus } from '@/lib/payments/service'
import { usageStatus } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'
import { Button, ButtonLink, Page, PageHeader, TransitionLink } from '@/components/ui'

async function cancel() { 'use server'; const u = await requireUser(); await cancelSubscription(u.id); redirect('/my/subscription') }

export default async function SubscriptionPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [s, u] = await Promise.all([subscriptionStatus(user.id), usageStatus(user.id)])
  const fmt = (d: Date) => d.toLocaleDateString('ko-KR')
  const pct = Math.round((u.remaining / u.limit) * 100)
  const reset = u.resetsAt ? `${u.resetsAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 초기화` : `첫 사용부터 ${u.windowHours}시간 단위로 초기화`
  const pro = u.plan === 'pro'
  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back="/my" title="구독" />

      {/* 요금제와 사용량. 마이페이지에 두면 매번 구독 권유를 보는 셈이라 여기로 옮겼다. 사용량은 조용한 선 하나 (명세서 6.1). */}
      <section style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p data-plan={u.plan} className="t-title-3">MIRO {pro ? 'Pro' : 'Free'}</p>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
              {pro ? '더 많은 대화·사진·통화를 쓰고 있어요.' : '대화·사진·통화 한도를 늘려요.'}
            </p>
          </div>
          {!pro && <ButtonLink href="/subscribe" variant="primary">구독하기</ButtonLink>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>남은 사용량</span>
          <span className="t-body" data-usage-remaining={u.remaining} style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>{pct}%</span>
        </div>
        <div role="meter" aria-label={COPY.a11y.usageMeter} aria-valuemin={0} aria-valuemax={u.limit} aria-valuenow={u.remaining} aria-valuetext={`${pct}% 남음`}
          style={{ height: 3, background: 'var(--color-surface-3)', overflow: 'hidden', borderRadius: 2 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-white)', transition: 'width var(--motion-slow) var(--ease-standard)' }} />
        </div>
        <p className="t-caption" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>{reset}</p>
        <TransitionLink href="/plans" className="t-caption" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'underline', color: 'var(--color-text-primary)' }}>요금제 비교</TransitionLink>
      </section>

      {!s ? (
        <p data-sub-status="none" className="t-body" style={{ color: 'var(--color-text-secondary)' }}>구독이 없습니다. <TransitionLink href="/plans" style={{ textDecoration: 'underline', color: 'var(--color-text-primary)' }}>요금제 보기</TransitionLink></p>
      ) : (
        <section data-sub-status={s.status} style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }} className="stack">
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
