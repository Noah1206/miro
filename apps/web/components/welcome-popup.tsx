'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { PUSH_PROMPT_DONE_EVENT, pushPromptDone, WELCOME_PARAM } from '@/lib/onboarding-options'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { duration, ease } from '@/lib/motion/tokens'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'

/**
 * 가입 선물 팝업. 온보딩을 마치고 선물을 받은 직후 한 번(주소의 ?welcome=1).
 * 바텀시트가 아니라 가운데 팝업이고, 알림 시트가 먼저 끝난 뒤에 뜬다(2026-09-30 요청). 닫으면 주소에서 표시를 지워
 * 새로고침해도 다시 뜨지 않는다. 글은 왼쪽 정렬: 머리말·그림·굵은 한 줄·설명, 아래 흰 버튼. 그림은 힉스필드로 만들었다.
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

  const title = t('가입 선물 {n} 크레딧 지급 완료!', { n: units.toLocaleString(locale) })
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="welcome" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : duration.fast, ease: ease.enter }}
          style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}>
          <motion.div ref={ref} role="dialog" aria-modal aria-labelledby={titleId} tabIndex={-1} data-welcome-popup onClick={(e) => e.stopPropagation()}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={{ duration: reduce ? 0 : duration.normal, ease: ease.enter }}
            style={{ width: '100%', maxWidth: 400, padding: '24px 20px 20px', borderRadius: 16, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', outline: 'none' }}>
            {/* 글은 왼쪽 정렬, 제목은 작게(2026-09-30 요청): 작은 머리말 → 그림 → 굵은 한 줄 → 설명 → 흰 버튼. */}
            <p style={{ margin: 0, fontSize: 15, fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>{t('신규 가입 혜택')}</p>
            {/* 힉스필드로 만든 선물 상자 그림(2026-09-30, GPT Image 2.5 · 투명 배경 · 400px) — MIRO 주황과 흰 리본. 꾸밈이라 읽지 않는다. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- 한 번 뜨는 작은 그림, next/image 최적화가 필요 없다 */}
            <img src="/welcome-gift.png" alt="" aria-hidden width={240} height={240} decoding="async" style={{ display: 'block', width: 240, height: 240, margin: '4px auto 0' }} />
            <h2 id={titleId} tabIndex={-1} data-initial-focus style={{ margin: '4px 0 0', fontSize: 17, lineHeight: 1.4, fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)', outline: 'none' }}>{title}</h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
              {t('MIRO에 온 걸 환영해요! 지금 바로 캐릭터와 대화를 시작해 보세요. 선물 크레딧은 ECHO 대화와 통화에 {n}일 동안 쓸 수 있어요.', { n: validDays })}
            </p>
            {/* 흰 바탕에 검은 글자, 글자는 다른 버튼과 같은 14px, 양끝이 완전히 둥근 알약 모양(2026-09-30 요청). */}
            <Button variant="secondary" full onClick={close}
              style={{ marginTop: 20, minHeight: 44, padding: '4px 24px', fontSize: 14, background: 'var(--color-white)', color: 'var(--color-black)', border: 0, borderRadius: 999 }}>
              {t('대화 시작하기')}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
