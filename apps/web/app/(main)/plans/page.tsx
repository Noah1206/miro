import { redirect } from 'next/navigation'
import { usagePolicy } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { effectivePlan } from '@/lib/usage/guard'
import { track } from '@/lib/analytics/track'
import { Accordion, ButtonLink, Page, PageHeader, Reveal } from '@/components/ui'

const FEATURES = ['자유 역할극 · 세계·관계·사건', '캐릭터 만들기 · Face Cast', 'AI 사진 · Live Scene', '캐릭터 선연락', '음성통화 · 영상통화', '장기 기억']

export default async function PlansPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const plan = await effectivePlan(user.id)
  const { free, pro } = usagePolicy().monthly
  void track(user.id, 'upgrade_viewed', { plan })
  return (
    <Page style={{ maxWidth: 560 }}>
      <PageHeader back="/my" title="같은 세계, 더 긴 시간" lead="두 요금제는 같은 기능과 품질을 제공해요. 차이는 매달 사용할 수 있는 양이에요." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {([['Free', free, plan === 'free'], ['Pro', pro, plan === 'pro']] as const).map(([name, limit, current]) => (
          <Reveal key={name} delay={name === 'Pro' ? 0.06 : 0}>
            <div style={{ padding: 18, borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', border: `1px solid ${name === 'Pro' ? 'var(--color-white)' : 'var(--color-border)'}` }}>
              <h2 className="t-title-3">MIRO {name}</h2>
              <p className="t-caption" style={{ marginTop: 4 }}>{name === 'Free' ? '기본 월간 사용량' : '더 넉넉한 월간 사용량'}</p>
              {current && <p className="t-micro" style={{ marginTop: 12, color: 'var(--color-text-primary)' }}>현재 요금제</p>}
            </div>
          </Reveal>
        ))}
      </div>
      <ul style={{ margin: 'var(--space-5) 0 0', padding: 0, listStyle: 'none' }}>
        {FEATURES.map((f) => <li key={f} className="t-body" style={{ padding: '11px 0', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}><span>{f}</span><span className="t-caption">Free · Pro</span></li>)}
      </ul>
      <div style={{ marginTop: 'var(--space-5)' }}>
        <Accordion title="가격은 언제 정해지나요?"><p className="t-caption">원가 측정이 끝난 뒤 확정됩니다. 지금 보이는 한도는 개발용 임시값입니다.</p></Accordion>
      </div>
      {plan === 'free' && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <ButtonLink href="/subscribe" data-upgrade variant="primary" size="lg" full>Pro 시작하기</ButtonLink>
        </div>
      )}
    </Page>
  )
}
