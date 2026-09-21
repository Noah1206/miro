import { productionRuntime } from '@miro/config'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { subscriptionStatus } from '@/lib/payments/service'
import { usageStatus } from '@/lib/usage/guard'
import { COPY } from '@/lib/copy'
import { ButtonLink, Page, PageHeader, TransitionLink } from '@/components/ui'

export default async function SubscriptionPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [s, u] = await Promise.all([subscriptionStatus(user.id), usageStatus(user.id)])
  const fmt = (d: Date) => d.toLocaleDateString('ko-KR')
  const pct = u.usedPercent
  const reset = u.resetsAt ? `${u.resetsAt.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })}에 초기화` : '매월 1일에 초기화'
  const pro = u.plan === 'pro'
  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader back="/my" title="이용권" />

      {/* 요금제와 사용량. 마이페이지에 두면 매번 구매 권유를 보는 셈이라 여기로 옮겼다. 사용량은 조용한 선 하나 (명세서 6.1). */}
      <section style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p data-plan={u.plan} className="t-title-3">MIRO {pro ? 'Pro' : 'Free'}</p>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
              {pro ? '하나의 월간 사용량으로 캐릭터와의 관계를 이어가요.' : '캐릭터와 대화하며 관계를 쌓아가요.'}
            </p>
          </div>
          {!pro && !productionRuntime() && <ButtonLink href="/subscribe" variant="primary">이용권 받기</ButtonLink>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>이번 달 Reality 사용량</span>
          <span className="t-body" data-usage-remaining={u.remaining} style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>{pct}% 사용</span>
        </div>
        <div role="meter" aria-label={COPY.a11y.usageMeter} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${pct}% 사용`}
          style={{ height: 3, background: 'var(--color-surface-3)', overflow: 'hidden', borderRadius: 2 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-white)', transition: 'width var(--motion-slow) var(--ease-standard)' }} />
        </div>
        <p className="t-caption" style={{ marginTop: 10, color: 'var(--color-text-tertiary)' }}>{reset}</p>
        <p className="t-caption" data-recharge-balance={u.rechargeRemaining} style={{ marginTop: 12 }}>충전 잔액 · {u.rechargeRemaining}</p>
        <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
          <TransitionLink href="/plans" className="t-caption hit" style={{ textDecoration: 'underline', color: 'var(--color-text-primary)' }}>요금제 비교</TransitionLink>
          <TransitionLink href="/recharge" className="t-caption hit" style={{ textDecoration: 'underline', color: 'var(--color-text-primary)' }}>충전소</TransitionLink>
        </div>
      </section>

      {!s ? (
        <p data-sub-status="none" className="t-body" style={{ color: 'var(--color-text-secondary)' }}>이용권이 없습니다. <TransitionLink href="/plans" className="hit" style={{ textDecoration: 'underline', color: 'var(--color-text-primary)' }}>요금제 보기</TransitionLink></p>
      ) : (
        <section data-sub-status={s.status} style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }} className="stack">
          <p className="t-title-3">MIRO Pro {s.entitled ? '' : <span className="t-caption">(만료)</span>}</p>
          {/* 자동 갱신이 없다 — 남은 기간을 알리고, 끝나면 다시 받게 한다. */}
          <p className="t-caption" style={{ marginTop: 6 }}>자동으로 갱신되지 않아요</p>
          <p className="t-caption">이용 기간 {fmt(s.currentPeriodStart)} ~ {fmt(s.currentPeriodEnd)}</p>
          {s.entitled && <p data-keeps-until className="t-body" style={{ marginTop: 10 }}>Pro 자격은 {fmt(s.currentPeriodEnd)}까지 유지돼요. 끝나기 전에 알려드릴게요.</p>}
          {!s.entitled && !productionRuntime() && <TransitionLink href="/subscribe" className="t-caption hit" style={{ marginTop: 12, textDecoration: 'underline' }}>이용권 다시 받기</TransitionLink>}
        </section>
      )}
    </Page>
  )
}
