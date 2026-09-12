import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser, requireUser } from '@/lib/auth'
import { cancelSubscription, subscriptionStatus } from '@/lib/payments/service'

async function cancel() { 'use server'; const u = await requireUser(); await cancelSubscription(u.id); redirect('/my/subscription') }

/** n60/n61/n62 — 구독 상태·갱신·해지. 해지 후에도 종료 시점까지 Pro 유지 표시. */
export default async function SubscriptionPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const s = await subscriptionStatus(user.id)
  const fmt = (d: Date) => d.toLocaleDateString('ko-KR')
  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 60px', maxWidth: 480, margin: '0 auto' }}>
      <Link href="/my" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>
      <h1 style={{ fontSize: 20, margin: '18px 0 16px' }}>구독 상태</h1>
      {!s ? (
        <p data-sub-status="none" style={{ color: 'var(--text-secondary)' }}>구독이 없습니다. <Link href="/plans" style={{ textDecoration: 'underline' }}>요금제 보기</Link></p>
      ) : (
        <section data-sub-status={s.status} style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 14, lineHeight: 1.9 }}>
          <p style={{ margin: 0 }}>요금제: <b>MIRO Pro</b> {s.entitled ? '' : '(만료)'}</p>
          <p style={{ margin: 0 }}>갱신: {s.renewalStatus === 'auto' ? '자동 갱신' : '해지됨 — 갱신되지 않음'}</p>
          <p style={{ margin: 0 }}>현재 기간: {fmt(s.currentPeriodStart)} ~ {fmt(s.currentPeriodEnd)}</p>
          {s.status === 'cancelled' && s.entitled && <p data-keeps-until style={{ margin: 0, color: 'var(--accent-strong)' }}>Pro 자격은 {fmt(s.currentPeriodEnd)}까지 유지됩니다.</p>}
          {s.status === 'active' && (
            <form action={cancel} style={{ marginTop: 12 }}>
              <button type="submit" style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--accent-strong)', fontSize: 13, cursor: 'pointer' }}>구독 해지</button>
            </form>
          )}
          {s.status === 'expired' && <Link href="/subscribe" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'underline', fontSize: 13 }}>다시 구독</Link>}
        </section>
      )}
    </main>
  )
}
