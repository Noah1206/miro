'use client'
import { useEffect, useState } from 'react'
import { Button, Sheet } from '@/components/ui'
import { SHEET_BUTTON } from '@/app/(main)/recharge/transfer-actions'
import { WELCOME_DONE_EVENT, WELCOME_PARAM } from '@/lib/onboarding-options'
import styles from './push-subscribe.module.css'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'

/**
 * 가입 보상 안내. 온보딩을 마치고 보상을 받은 직후 한 번(주소의 ?welcome=1). 닫으면 주소에서 표시를 지워
 * 새로고침해도 다시 뜨지 않는다. 지갑 시트와 같은 틀: 가운데 아이콘·제목·한 줄, 아래 어두운 버튼.
 */
export function WelcomeSheet({ units, validDays }: { units: number; validDays: number }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  useEffect(() => { if (new URLSearchParams(window.location.search).has(WELCOME_PARAM)) setOpen(true) }, [])

  function close() {
    setOpen(false)
    const url = new URL(window.location.href); url.searchParams.delete(WELCOME_PARAM)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    window.dispatchEvent(new Event(WELCOME_DONE_EVENT))
  }

  const title = t('가입 선물 {n} 크레딧', { n: units.toLocaleString(locale) })
  return (
    <Sheet open={open} onClose={close} label={title}>
      <div className={styles.stack} data-welcome-sheet>
        <div className={styles.center}>
          <svg className={styles.icon} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
            <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
          </svg>
          <h2 className="t-title-2" tabIndex={-1} data-initial-focus>{title}</h2>
          <p>{t('MIRO에 온 걸 환영해요. {n}일 안에 캐릭터와의 대화에 쓸 수 있어요.', { n: validDays })}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" full style={SHEET_BUTTON} onClick={close}>{t('대화 시작하기')}</Button>
        </div>
      </div>
    </Sheet>
  )
}
