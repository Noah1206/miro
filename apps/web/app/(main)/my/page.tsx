import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { usageStatus } from '@/lib/usage/guard'
import { TabBar } from '@/components/tab-bar'

/** My — 요금제, 공통 사용량, 초기화 시각. 세부 크레딧 차감값은 강조하지 않는다 (명세서 6.1). */
export default async function MyPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const u = await usageStatus(user.id)
  const pct = Math.round((u.remaining / u.limit) * 100)

  return (
    <main style={{ minHeight: '100dvh', padding: '28px 24px 96px', maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 24px' }}>My</h1>

      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)', padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>
            현재 요금제
          </p>
          <p data-plan={u.plan} style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            MIRO {u.plan === 'pro' ? 'Pro' : 'Free'}
          </p>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span style={{ color: 'var(--text-secondary)' }}>남은 사용량</span>
            <span data-usage-remaining={u.remaining}>{pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--elevated)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            {u.resetsAt
              ? `${u.resetsAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 초기화`
              : `${u.windowHours}시간 단위로 사용량이 초기화됩니다. 첫 사용 시 창이 시작됩니다.`}
          </p>
        </div>

        <Link href="/plans" style={{
          display: 'block', marginTop: 16, padding: 12, textAlign: 'center', borderRadius: 10,
          border: '1px solid var(--border)', fontSize: 13.5, color: 'var(--text-primary)',
        }}>
          요금제 비교
        </Link>
      </section>

      <Menu href="/my/subscription" label="구독 관리" />
      <Menu href="/my/settings" label="알림 · 통화 · 야간 연락 설정" />
      <Menu href="/my/verify" label="성인 인증" />
      <Menu href="/my/permissions" label="권한 안내" />
      <Menu href="/my/delete" label="계정 삭제" danger />

      <TabBar />
    </main>
  )
}

function Menu({ href, label, danger = false }: { href: string; label: string; danger?: boolean }) {
  return (
    <Link href={href} style={{
      display: 'block', padding: '15px 18px', marginBottom: 8, borderRadius: 12,
      background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 14,
      color: danger ? 'var(--accent-strong)' : 'var(--text-primary)',
    }}>{label}</Link>
  )
}
