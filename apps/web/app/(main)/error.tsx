'use client'
import { Button, ButtonLink, Page } from '@/components/ui'
import { useT } from '@/lib/i18n/client'

/** 11/10 화면 오류 — 다시 시도하거나 홈으로. */
export default function MainError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT()
  return (
    <Page style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: '70dvh', textAlign: 'center' }}>
      <h1 className="t-title-3">{t('잠시 문제가 생겼어요')}</h1>
      <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('잠시 후 다시 시도해 주세요.')}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" onClick={() => reset()}>{t('다시 시도')}</Button>
        <ButtonLink href="/home">{t('홈으로')}</ButtonLink>
      </div>
    </Page>
  )
}
