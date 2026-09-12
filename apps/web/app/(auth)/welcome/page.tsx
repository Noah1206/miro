import { Page, PageHeader, Reveal, TransitionLink } from '@/components/ui'

/** n12 — 두 개의 문. 공식 세계로 들어가거나, 직접 만든다. */
export default function Welcome() {
  return (
    <Page style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 480 }}>
      <PageHeader title="어디서 시작할까요" lead="나중에 언제든 다른 문으로도 들어갈 수 있습니다." />
      <div className="stack" style={{ gap: 12 }}>
        <Reveal delay={0.05}>
          <TransitionLink href="/home" className="hoverable" style={{ display: 'block', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border-strong)' }}>
            <p className="t-micro" style={{ marginBottom: 8 }}>MIRO ORIGINALS</p>
            <p className="t-title-3" style={{ marginBottom: 4 }}>토마스 · 강태윤 · 히사시</p>
            <p className="t-caption">MIRO가 만든 세 사람의 세계로 바로 들어갑니다.</p>
          </TransitionLink>
        </Reveal>
        <Reveal delay={0.12}>
          <TransitionLink href="/create" className="hoverable" style={{ display: 'block', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
            <p className="t-micro" style={{ marginBottom: 8 }}>직접 만들기</p>
            <p className="t-title-3" style={{ marginBottom: 4 }}>한 문장으로 시작하는 사람</p>
            <p className="t-caption">원하는 외형·성격·세계를 만들고, 그 안으로 들어갑니다.</p>
          </TransitionLink>
        </Reveal>
      </div>
    </Page>
  )
}
