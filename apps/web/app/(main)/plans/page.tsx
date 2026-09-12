import Link from 'next/link'
import { redirect } from 'next/navigation'
import { POLICY } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { effectivePlan } from '@/lib/usage/guard'
import { track } from '@/lib/analytics/track'

const FEATURES = [
  '자유 역할극 · 세계·관계·사건 엔진', '캐릭터 만들기 · Face Cast', 'AI 사진 · Live Scene',
  '캐릭터 선연락', '음성통화 · 영상통화', '장기 기억',
]

/** 10.1 — Free/Pro 는 같은 핵심 기능. 차이는 5시간 사용량 한도뿐이다. 가격은 확정 전(TBD). */
export default async function PlansPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const plan = await effectivePlan(user.id)
  const { free, pro } = POLICY.usage.limits
  void track(user.id, 'upgrade_viewed', { plan })

  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 60px', maxWidth: 560, margin: '0 auto' }}>
      <Link href="/my" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>
      <h1 style={{ fontSize: 22, margin: '18px 0 6px' }}>요금제 비교</h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
        두 요금제 모두 같은 핵심 기능을 씁니다. 차이는 {POLICY.usage.windowHours}시간마다 초기화되는 사용량 한도입니다.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card name="Free" current={plan === 'free'} limit={free} />
        <Card name="Pro" current={plan === 'pro'} limit={pro} accent />
      </div>

      <ul style={{ margin: '24px 0 0', padding: 0, listStyle: 'none' }}>
        {FEATURES.map((f) => (
          <li key={f} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5,
                               display: 'flex', justifyContent: 'space-between' }}>
            <span>{f}</span><span style={{ color: 'var(--text-secondary)' }}>Free · Pro</span>
          </li>
        ))}
      </ul>

      {plan === 'free' && (
        <Link href="/subscribe" data-upgrade style={{
          display: 'block', marginTop: 28, padding: 16, textAlign: 'center', borderRadius: 'var(--radius)',
          background: 'var(--accent)', fontWeight: 600, fontSize: 15,
        }}>
          Pro 시작하기
        </Link>
      )}
      <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 12, textAlign: 'center' }}>
        가격과 정확한 한도는 원가 측정 후 확정됩니다. 현재 값은 개발용 임시값입니다.
      </p>
    </main>
  )
}

function Card({ name, current, limit, accent = false }: {
  name: string; current: boolean; limit: number; accent?: boolean
}) {
  return (
    <div style={{
      padding: 18, borderRadius: 'var(--radius)', background: 'var(--surface)',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
    }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>MIRO {name}</p>
      <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        {POLICY.usage.windowHours}시간당 {limit} <span style={{ fontSize: 10 }}>(DEV_DEFAULT)</span>
      </p>
      {current && (
        <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--accent-strong)', letterSpacing: '0.1em' }}>
          현재 요금제
        </p>
      )}
    </div>
  )
}
