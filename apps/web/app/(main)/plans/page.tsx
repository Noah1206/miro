import { redirect } from 'next/navigation'
import { POLICY, productionRuntime } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { effectivePlan } from '@/lib/usage/guard'
import { track } from '@/lib/analytics/track'
import { Accordion, ButtonLink, Page, PageHeader, Reveal } from '@/components/ui'

const FEATURES = ['텍스트 역할극', '캐릭터 만들기', '대화 저장']

export default async function PlansPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const plan = await effectivePlan(user.id)
  void track(user.id, 'upgrade_viewed', { plan })
  return (
    <Page style={{ maxWidth: 560 }}>
      <PageHeader back="/my" title="MIRO Free · Pro" lead="캐릭터와 관계를 쌓고, 같은 세계의 이야기를 이어가요." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {([['Free', plan === 'free'], ['Pro', plan === 'pro']] as const).map(([name, current]) => (
          <Reveal key={name} delay={name === 'Pro' ? 0.06 : 0}>
            <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', border: `1px solid ${name === 'Pro' ? 'var(--color-white)' : 'var(--color-border)'}` }}>
              <h2 className="t-title-3">MIRO {name}</h2>
              <p className="t-body" style={{ marginTop: 8 }}>{name === 'Free' ? '무료' : `월 ${POLICY.subscription.priceLabel}`}</p>
              <p className="t-caption" style={{ marginTop: 4 }}>{name === 'Free' ? '기본 채팅 무료 · 추가 인터랙션은 사용량 한도 내 이용' : '더 깊고 잦은 연결을 준비 중이에요'}</p>
              {current && <p className="t-micro" style={{ marginTop: 12, color: 'var(--color-text-primary)' }}>현재 요금제</p>}
            </div>
          </Reveal>
        ))}
      </div>
      <ul style={{ margin: 'var(--space-5) 0 0', padding: 0, listStyle: 'none' }}>
        {FEATURES.map((f) => <li key={f} className="t-body" style={{ padding: '11px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}><span>{f}</span><span className="t-caption">Free · Pro</span></li>)}
      </ul>
      <div style={{ marginTop: 'var(--space-5)' }}>
        <Accordion title="Pro는 언제 이용할 수 있나요?"><p className="t-caption">1개월 이용권 9,900원으로 준비 중입니다. 자동 갱신 없이 필요할 때만 받는 방식이고, 결제 준비가 완료되면 안내할게요.</p></Accordion>
      </div>
      {productionRuntime() && <p role="status" className="t-caption" style={{ marginTop: 20 }}>Pro는 준비 중입니다. 기억과 연락의 깊이를 넓히는 경험을 준비하고 있어요. 제공 범위와 사용량은 출시 전에 안내할게요.</p>}
      {plan === 'free' && !productionRuntime() && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <ButtonLink href="/subscribe" data-upgrade variant="primary" size="lg" full>Pro 이용권 받기</ButtonLink>
        </div>
      )}
    </Page>
  )
}
