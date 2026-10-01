'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui'
import { PUSH_PROMPT_DONE_EVENT, pushPromptDone, WELCOME_PARAM } from '@/lib/onboarding-options'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { duration, ease } from '@/lib/motion/tokens'
import { useFocusTrap } from '@/lib/motion/use-focus-trap'

/** 그림 조각을 240 무대 위 제자리에 둔다(1024 원본 좌표 × 240/1024 — 예전 한 장짜리 그림과 같은 배율). */
const at = ([left, top, width, height]: readonly number[]) => ({ position: 'absolute', left, top, width, height }) as const
/** 늦게 출발하는 스프링. 가로는 느리고 세로는 빠르게 주면 곧게 가지 않고 포물선을 그린다. */
const kick = (delay: number, stiffness: number, damping: number) => ({ type: 'spring', delay, stiffness, damping }) as const
/** '팡' 하고 열리는 때(초). 0.3초부터 흔들리고, 열리기 직전 꾹 눌렸다가 이때 튀어 오른다. */
const POP = 0.85
/** 동전: 상자 안(입구 가운데 아래)에서 출발해 제자리로 튄다. from = 제자리에서 출발점까지. */
const COINS = [
  { src: 'coin-2', box: [104.1, 99.8, 26.2, 25.3], from: { x: 3, y: 38, rotate: 30 }, delay: 0.02 },
  { src: 'coin-1', box: [130.3, 86.5, 27.7, 24.4], from: { x: -24, y: 51, rotate: -40 }, delay: 0.07 },
] as const
/** 반짝이: 동전이 나온 뒤 제자리에서 하나씩 반짝. */
const SPARKLES = [
  { src: 'sparkle-1', box: [87.9, 108, 11.7, 12.4], delay: 0.16 },
  { src: 'sparkle-2', box: [156.6, 105, 10.1, 11.2], delay: 0.22 },
  { src: 'sparkle-3', box: [154, 124.2, 6.3, 7.5], delay: 0.28 },
] as const
/** 종이 폭죽(10/1 요청): 열리는 순간 입구에서 위로 터졌다가 팔랑이며 떨어진다. 값은 고정된 의사 난수라 매번 같은 모양. */
const rand = (i: number, k: number) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v) }
const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  x: (i / 13 - 0.5) * 170 + (rand(i, 1) - 0.5) * 20,
  up: -(60 + rand(i, 2) * 55),
  down: 30 + rand(i, 3) * 50,
  spin: (rand(i, 4) - 0.5) * 900,
  color: ['#D2592C', '#EADFCF', '#F08A4B', '#F6C9A2'][i % 4],
  w: i % 3 === 0 ? 5 : 4,
  h: i % 3 === 0 ? 5 : 8,
  delay: rand(i, 5) * 0.06,
  duration: 1.1 + rand(i, 6) * 0.4,
}))

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

  const title = t('가입 선물 {n} 미로 지급 완료!', { n: units.toLocaleString(locale) })
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
            {/* 상자가 '팡' 열리며 예전 선물 그림이 튀어나온다(2026-10-01 요청): 닫힌 상자가 내려앉아 흔들리다가 꾹 눌렸다 튀어 오르는 순간 열린 그림 조각으로
                바뀌고, 뚜껑이 날아가며 입구에서 빛과 종이 폭죽이 터지고, 동전이 상자 안에서 포물선으로 튀어나온 뒤 반짝이가 하나씩 반짝 — 예전 그림 그대로 멈춘다.
                조각은 힉스필드 선물 그림(9/30)을 자른 것, 닫힌 상자는 같은 그림을 참고해 새로 만든 것(10/1, 몸통 폭·바닥을 열린 상자에 맞춤) — public/welcome-gift.
                상자에 걸친 동전 하나는 상자와 색이 같아 떼지 않았다. 움직임 줄이기면 마지막 장면만. 꾸밈이라 읽지 않는다. */}
            <motion.div aria-hidden style={{ position: 'relative', width: 240, height: 240, margin: '4px auto 0', transformOrigin: '50% 83%' }}
              initial={reduce ? false : { y: -16, opacity: 0 }}
              animate={reduce ? { y: 0, opacity: 1 } : { y: 0, opacity: 1, rotate: [0, -4, 4, -3, 2, 0], scaleX: [1, 1.07, 0.95, 1.02, 1], scaleY: [1, 0.88, 1.07, 0.98, 1] }}
              transition={{
                y: { type: 'spring', stiffness: 320, damping: 20 }, opacity: { duration: duration.fast }, rotate: { delay: 0.3, duration: 0.36 },
                scaleX: { delay: POP - 0.16, duration: 0.46, times: [0, 0.35, 0.6, 0.82, 1] }, scaleY: { delay: POP - 0.16, duration: 0.46, times: [0, 0.35, 0.6, 0.82, 1] },
              }}>
              {!reduce && <motion.div style={{ ...at([49.5, 64.8, 140, 140]), borderRadius: '50%', background: 'radial-gradient(circle, rgba(255, 234, 204, 0.95), rgba(255, 234, 204, 0) 70%)' }}
                initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: [0, 1, 0], scale: 1.4 }}
                transition={{ opacity: { delay: POP, duration: 0.5, times: [0, 0.12, 1] }, scale: { delay: POP, duration: 0.5, ease: 'easeOut' } }} />}
              {/* 열린 상자·뚜껑은 '팡' 순간에 닫힌 상자 그림과 자리를 바꾼다 */}
              <motion.img src="/welcome-gift/box.webp" alt="" decoding="async" style={at([78.5, 118.1, 82, 81.3])}
                initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: POP, duration: 0.03 }} />
              {/* 동전은 상자 앞 테두리(V자) 위로만 보인다 — 상자 안에서 솟아오르는 것처럼 */}
              <div style={{ position: 'absolute', inset: 0, clipPath: 'polygon(0 0, 100% 0, 100% 135px, 157.5px 135px, 123.5px 145.3px, 82px 134.3px, 0 134.3px)' }}>
                {COINS.map((c) => (
                  <motion.img key={c.src} src={`/welcome-gift/${c.src}.webp`} alt="" decoding="async" style={at(c.box)}
                    initial={reduce ? false : { ...c.from, scale: 0.85 }} animate={{ x: 0, y: 0, rotate: 0, scale: 1 }}
                    transition={{ y: kick(POP + c.delay, 320, 18), x: kick(POP + c.delay, 170, 20), rotate: kick(POP + c.delay, 200, 14), scale: kick(POP + c.delay, 300, 22) }} />
                ))}
              </div>
              {SPARKLES.map((s) => (
                <motion.img key={s.src} src={`/welcome-gift/${s.src}.webp`} alt="" decoding="async" style={at(s.box)}
                  initial={reduce ? false : { scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={kick(POP + s.delay, 420, 12)} />
              ))}
              {/* 뚜껑은 닫힌 상자 위 자리(원래 뚜껑을 19° 돌려 1.08배)에서 위로 세게 차고 나간다 */}
              <motion.img src="/welcome-gift/lid.webp" alt="" decoding="async" style={at([77.3, 34.9, 78.8, 66.6])}
                initial={reduce ? false : { x: 7.6, y: 54.5, rotate: 19, scale: 1.08, opacity: 0 }} animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
                transition={{ opacity: { delay: POP, duration: 0.03 }, y: { ...kick(POP, 340, 17), velocity: -400 }, x: kick(POP, 200, 20), rotate: kick(POP, 220, 15), scale: kick(POP, 300, 24) }} />
              {!reduce && CONFETTI.map((c, i) => (
                <motion.span key={i} style={{ position: 'absolute', left: 119.5 - c.w / 2, top: 134.8 - c.h / 2, width: c.w, height: c.h, borderRadius: 1, background: c.color }}
                  initial={{ opacity: 0 }} animate={{ x: c.x, y: [0, c.up, c.down], rotate: c.spin, scaleY: [1, 0.3, 1, 0.3, 1], opacity: [0, 1, 1, 0] }}
                  transition={{
                    delay: POP + c.delay, duration: c.duration, ease: 'linear',
                    x: { delay: POP + c.delay, duration: c.duration, ease: [0.2, 0.7, 0.4, 1] },
                    y: { delay: POP + c.delay, duration: c.duration, times: [0, 0.3, 1], ease: ['easeOut', 'easeIn'] },
                    opacity: { delay: POP + c.delay, duration: c.duration, times: [0, 0.05, 0.7, 1] },
                  }} />
              ))}
              {!reduce && <motion.img src="/welcome-gift/closed.webp" alt="" decoding="async" style={at([76.5, 94.1, 85.8, 105.5])}
                initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: POP, duration: 0.03 }} />}
            </motion.div>
            <h2 id={titleId} tabIndex={-1} data-initial-focus style={{ margin: '4px 0 0', fontSize: 17, lineHeight: 1.4, fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)', outline: 'none' }}>{title}</h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
              {t('MIRO에 온 걸 환영해요! 지금 바로 캐릭터와 대화를 시작해 보세요. 선물 미로는 ECHO 대화와 통화에 {n}일 동안 쓸 수 있어요.', { n: validDays })}
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
