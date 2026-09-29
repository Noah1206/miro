import { Page, TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
export default async function Deleted() {
  const t = await getT()
  return (
    <Page style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <h1 data-account-deleted className="t-title-2 t-quote" style={{ marginBottom: 10 }}>{t('계정이 삭제되었습니다')}</h1>
        <p className="t-caption" style={{ marginBottom: 'var(--space-5)' }}>{t('그동안 함께해 주셔서 감사합니다.')}</p>
        <TransitionLink href="/login" className="t-caption hit" style={{ textDecoration: 'underline' }}>{t('처음으로')}</TransitionLink>
      </div>
    </Page>
  )
}
