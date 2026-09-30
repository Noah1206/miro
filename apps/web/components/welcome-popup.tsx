'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { SHEET_BUTTON } from '@/app/(main)/recharge/transfer-actions'
import { PUSH_PROMPT_DONE_EVENT, pushPromptDone, WELCOME_PARAM } from '@/lib/onboarding-options'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { duration, ease } from '@/lib/motion/tokens'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'
import styles from './push-subscribe.module.css'

/**
 * 가입 선물 팝업. 온보딩을 마치고 선물을 받은 직후 한 번(주소의 ?welcome=1).
 * 바텀시트가 아니라 가운데 팝업이고, 알림 시트가 먼저 끝난 뒤에 뜬다(2026-09-30 요청). 닫으면 주소에서 표시를 지워
 * 새로고침해도 다시 뜨지 않는다. 속은 지갑 시트와 같은 틀: 가운데 아이콘·제목·한 줄, 아래 어두운 버튼.
 */
export function WelcomePopup({ units, validDays }: { units: number; validDays: number }) {
  const [open, setOpen] = useState(false)
  const t = useT()
  const locale = INTL_LOCALE[useLanguage()]
  const reduce = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(ref, open)

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(WELCOME_PARAM)) return
    const show = () => setOpen(true)
    if (pushPromptDone()) return show()
    window.addEventListener(PUSH_PROMPT_DONE_EVENT, show, { once: true })
    return () => window.removeEventListener(PUSH_PROMPT_DONE_EVENT, show)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  function close() {
    setOpen(false)
    const url = new URL(window.location.href); url.searchParams.delete(WELCOME_PARAM)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }

  const title = t('가입 선물 {n} 크레딧', { n: units.toLocaleString(locale) })
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="welcome" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : duration.fast, ease: ease.enter }}
          style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', padding: 'var(--space-5)', background: 'rgba(0,0,0,0.6)' }}>
          <motion.div ref={ref} role="dialog" aria-modal aria-labelledby={titleId} tabIndex={-1} data-welcome-popup onClick={(e) => e.stopPropagation()}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduce ? 0 : duration.normal, ease: ease.enter }}
            style={{ width: '100%', maxWidth: 320, padding: 'var(--space-5)', borderRadius: 'var(--radius-sheet)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', outline: 'none' }}>
            <div className={styles.stack}>
              <div className={styles.center}>
                <svg className={styles.icon} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                  <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
                </svg>
                <h2 id={titleId} className="t-title-2" tabIndex={-1} data-initial-focus>{title}</h2>
                <p>{t('MIRO에 온 걸 환영해요. {n}일 안에 캐릭터와의 대화에 쓸 수 있어요.', { n: validDays })}</p>
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" full style={SHEET_BUTTON} onClick={close}>{t('대화 시작하기')}</Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
