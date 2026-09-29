import { YUJIN } from '@/lib/alpha/character'
import { TrackView } from '../track-view'
import { WaitlistForm } from './form'
import { getT } from '@/lib/i18n/server'

/** 이메일 하나. 성공 뒤에도 관계의 문장으로 말한다. */
export default async function AlphaWaitlistPage() {
  const t = await getT()
  return (
    <main id="main" tabIndex={-1} className="page" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'var(--space-6)', paddingBottom: 'var(--space-6)', outline: 'none' }}>
      <TrackView event="waitlist_view" />
      <div className="stack" style={{ gap: 8 }}>
        <p className="t-micro" style={{ color: 'var(--color-text-tertiary)' }}>MIRO ALPHA</p>
        <h1 className="t-title-1">{t('{name}과의 관계, 여기서 끊기엔 아깝잖아요.', { name: YUJIN.name })}</h1>
        <p className="t-body" style={{ color: 'var(--color-text-secondary)' }}>{t('정식 Alpha가 열리면 가장 먼저 초대해드릴게요. 이메일 하나면 됩니다.')}</p>
      </div>
      <WaitlistForm />
    </main>
  )
}
