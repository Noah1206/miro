import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { usageStatus } from '@/lib/usage/guard'
import { Page, Stagger, StaggerItem, TransitionLink, Tip } from '@/components/ui'
import { COPY } from '@/lib/copy'

/** 사용량은 조용한 선 하나. 차감값을 강조하지 않는다 (명세서 6.1). */
export default async function MyPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const u = await usageStatus(user.id)
  const pct = Math.round((u.remaining / u.limit) * 100)
  const reset = u.resetsAt ? `${u.resetsAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 초기화` : `첫 사용부터 ${u.windowHours}시간 단위로 초기화`
  return (
    <Page>
      <h1 className="t-title-1" style={{ marginBottom: 'var(--space-5)' }}>내 정보</h1>
      <div style={{ marginBottom: 'var(--space-4)' }}><Tip id="my">알림·통화·야간 연락은 설정에서 끄고 켤 수 있어요.</Tip></div>
      <section style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <h2 className="t-micro">요금제</h2>
          <p data-plan={u.plan} className="t-title-3">MIRO {u.plan === 'pro' ? 'Pro' : 'Free'}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }} className="t-caption">
          <span>남은 사용량</span><span data-usage-remaining={u.remaining} style={{ color: 'var(--color-text-primary)' }}>{pct}%</span>
        </div>
        <div role="meter" aria-label={COPY.a11y.usageMeter} aria-valuemin={0} aria-valuemax={u.limit} aria-valuenow={u.remaining} aria-valuetext={`${pct}% 남음`} style={{ height: 3, background: 'var(--color-surface-3)', overflow: 'hidden', borderRadius: 2 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-white)', transition: 'width var(--motion-slow) var(--ease-standard)' }} />
        </div>
        <p className="t-caption" style={{ marginTop: 10 }}>{reset}</p>
        <TransitionLink href="/plans" className="t-caption" style={{ display: 'inline-block', marginTop: 14, textDecoration: 'underline', color: 'var(--color-text-primary)' }}>요금제 비교</TransitionLink>
      </section>
      <Stagger as="div" className="stack" style={{ gap: 8 }}>
        {[['/my/subscription', '구독 관리'], ['/my/settings', '알림 · 통화 · 야간 연락'], ['/my/verify', '성인 인증'], ['/my/permissions', '권한 안내']].map(([h, l]) => (
          <StaggerItem key={h}><Row href={h!} label={l!} /></StaggerItem>
        ))}
        <StaggerItem><Row href="/my/delete" label="계정 삭제" danger /></StaggerItem>
      </Stagger>
    </Page>
  )
}
function Row({ href, label, danger }: { href: string; label: string; danger?: boolean }) {
  return (
    <TransitionLink href={href} className="hoverable" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)', color: danger ? 'var(--color-danger)' : 'inherit' }}>
      <span className="t-body">{label}</span>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><path d="M9 5l7 7-7 7" /></svg>
    </TransitionLink>
  )
}
