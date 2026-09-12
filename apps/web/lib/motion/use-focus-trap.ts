'use client'
import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * 열리면 안으로 초점을 옮기고, Tab 은 안에서 돌며, 닫히면 열었던 곳으로 돌려준다 (2.4.3, 2.1.2).
 * inert 를 쓰지 않는 이유: 페이지 스크롤 잠금과 함께 쓰면 iOS 에서 불안정하다.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return
    const root = ref.current; if (!root) return
    const opener = document.activeElement as HTMLElement | null
    const first = root.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? root).focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (items.length === 0) { e.preventDefault(); root.focus(); return }
      const i = items.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1]!.focus() }
      else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0]!.focus() }
    }
    root.addEventListener('keydown', onKey)
    return () => { root.removeEventListener('keydown', onKey); opener?.focus?.({ preventScroll: true }) }
  }, [ref, open])
}
