import { ButtonLink, LogoMark, Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'

/** 11/10 없는 주소 — 홈으로 돌려보낸다. */
export default async function NotFound() {
  const t = await getT()
  return (
    <Page style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: '100dvh', textAlign: 'center' }}>
      <LogoMark size={40} />
      <h1 className="t-title-3">{t('페이지를 찾을 수 없어요')}</h1>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('주소가 바뀌었거나 더 이상 볼 수 없는 페이지예요.')}</p>
      <ButtonLink href="/home" variant="primary">{t('홈으로')}</ButtonLink>
    </Page>
  )
}
