'use client'
import { useCallback, useRef, useState } from 'react'
import { longPress as lp, tapSlopPx } from './tokens'

export type PressState = 'idle' | 'down' | 'pressed' | 'longpressed' | 'cancelled'

type Options = {
  disabled?: boolean
  onPress?: () => void
  onLongPress?: () => void
  /** 기본 500ms. Long Press 만으로 접근되는 기능을 두지 않는다 — 항상 다른 입력도 제공. */
  longPressMs?: number
}

/**
 * Pointer Events 기반 버튼 상태 기계.
 *   idle → pointerdown(down) → pressed → pointerup(release) → press
 *   pointermove > slop → cancelled (탭이 아니라 드래그/스크롤이다)
 *   down 유지 ≥ longPressMs → longpressed
 * mouse/touch/pen 을 하나의 모델로 다룬다.
 */
export function usePress(opts: Options = {}) {
  const [state, setState] = useState<PressState>('idle')
  const origin = useRef<{ x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (opts.disabled || e.button !== 0) return
    origin.current = { x: e.clientX, y: e.clientY }
    longFired.current = false
    // setPointerCapture 를 쓰지 않는다: 부모가 캡처하면 자식 링크/버튼의 click 이 사라진다.
    setState('pressed')
    if (opts.onLongPress) {
      timer.current = setTimeout(() => { longFired.current = true; setState('longpressed'); opts.onLongPress?.() }, opts.longPressMs ?? lp.delayMs)
    }
  }, [opts.disabled, opts.onLongPress, opts.longPressMs])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!origin.current) return
    const dx = e.clientX - origin.current.x, dy = e.clientY - origin.current.y
    if (Math.hypot(dx, dy) > (opts.onLongPress ? lp.slopPx : tapSlopPx)) {
      clearTimer(); origin.current = null; setState('cancelled')
      setTimeout(() => setState('idle'), 0)
    }
  }, [opts.onLongPress])

  const end = useCallback((fire: boolean) => {
    clearTimer()
    const wasTracking = origin.current !== null
    origin.current = null
    setState('idle')
    if (fire && wasTracking && !longFired.current) opts.onPress?.()
  }, [opts.onPress])

  return {
    state,
    pressed: state === 'pressed' || state === 'longpressed',
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: () => end(true),
      onPointerCancel: () => end(false),
      onPointerLeave: () => { if (origin.current) end(false) },
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') setState('pressed') },
      onKeyUp: (e: React.KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') setState('idle') },
    },
  }
}
