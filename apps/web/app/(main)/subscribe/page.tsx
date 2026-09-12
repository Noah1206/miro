import Link from 'next/link'
import { redirect } from 'next/navigation'
import { POLICY } from '@miro/config'
import { resolvePayment } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { effectivePlan } from '@/lib/usage/guard'
import { beginCheckout, restore, simulateOutcome } from './actions'

/** n55 — Pro 구독 구매. 가격은 확정 전(TBD)이며 그 사실을 숨기지 않는다. */
export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  if ((await effectivePlan(user.id)) === 'pro') redirect('/my/subscription')
  const { checkout } = await searchParams
  const provider = resolvePayment()

  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 60px', maxWidth: 480, margin: '0 auto' }}>
      <Link href="/plans" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>
      <h1 style={{ fontSize: 22, margin: '18px 0 6px' }}>MIRO Pro</h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 18px' }}>
        같은 기능, {POLICY.usage.windowHours}시간당 {POLICY.usage.limits.pro}의 사용량. 가격: <b>{POLICY.subscription.priceLabel}</b> (확정 전)
      </p>
      {provider.info.notice && <p role="status" style={{ fontSize: 12, padding: '10px 12px', marginBottom: 16, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--elevated)', color: 'var(--text-secondary)' }}>⚠ {provider.info.notice}</p>}

      {!checkout ? (
        <>
          <form action={beginCheckout}>
            <button type="submit" data-checkout style={{ width: '100%', padding: 16, borderRadius: 'var(--radius)', border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Pro 구독 시작</button>
          </form>
          <form action={restore} style={{ marginTop: 12, textAlign: 'center' }}>
            <button type="submit" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>이전 구매 복원</button>
          </form>
        </>
      ) : (
        <section data-mock-checkout style={{ padding: 18, background: 'var(--surface)', border: '1px dashed var(--accent)', borderRadius: 12 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13 }}>결제 시뮬레이션 — 실제 PG 에서는 이 화면 대신 결제창으로 이동하고 결과는 webhook 으로 들어옵니다.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <form action={simulateOutcome.bind(null, checkout, 'success')} style={{ flex: 1 }}><button type="submit" style={btn('#2EA85D')}>결제 성공</button></form>
            <form action={simulateOutcome.bind(null, checkout, 'failed')} style={{ flex: 1 }}><button type="submit" style={btn('#D9363E')}>결제 실패</button></form>
          </div>
        </section>
      )}
    </main>
  )
}
const btn = (bg: string): React.CSSProperties => ({ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: bg, color: '#fff', fontWeight: 600, cursor: 'pointer' })
