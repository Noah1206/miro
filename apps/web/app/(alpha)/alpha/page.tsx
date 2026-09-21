import { SubmitButton } from '@/components/ui/submit-button'
import { YUJIN } from '@/lib/alpha/character'
import { startExperience } from './actions'
import { TrackView } from './track-view'

/**
 * 랜딩 — 설명이 아니라 이미 와 있는 메시지. 버튼 하나로 대화에 들어간다.
 * 로그인·가입·설문은 없다. 그건 관계가 생긴 뒤에 묻는다.
 */
export default function AlphaLanding() {
  return (
    <main id="main" tabIndex={-1} className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--space-6)', paddingBottom: 'var(--space-6)', outline: 'none' }}>
      <TrackView event="landing_view" />
      <p className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>MIRO</p>

      {/* 메신저 알림처럼 — 이름, 한 마디, 방금. */}
      <section aria-label="새 메시지" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
        <span aria-hidden style={{ width: 52, height: 52, borderRadius: 26, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--color-surface-3)', fontSize: 20, fontWeight: 700 }}>
          {YUJIN.name.slice(0, 1)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <p className="t-body" style={{ fontWeight: 'var(--weight-semibold)' }}>{YUJIN.name}</p>
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>방금</span>
          </div>
          <p className="t-body-lg t-quote" style={{ color: 'var(--color-text-primary)', marginTop: 4 }}>{YUJIN.opening}</p>
        </div>
      </section>

      <form action={startExperience} className="stack" style={{ gap: 10 }}>
        <SubmitButton variant="primary" size="lg" full>답장하기</SubmitButton>
        <p className="t-caption" style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>회원가입 없이 바로 시작해요.</p>
      </form>
    </main>
  )
}
