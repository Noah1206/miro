'use client'
/**
 * View Transition API 로 페이지 전환. 지원 안 하면 그냥 이동한다.
 * html[data-nav] 로 방향을 알려 CSS 가 forward / back 을 다르게 그린다.
 * 공유 요소는 `viewTransitionName` 만 같으면 브라우저가 알아서 이어 그린다 (Shared Element).
 */
let resolvePending: (() => void) | null = null

export function startNavigation(direction: 'forward' | 'back', navigate: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } }
  document.documentElement.dataset.nav = direction
  if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { navigate(); delete document.documentElement.dataset.nav; return }
  const t = doc.startViewTransition(() => new Promise<void>((resolve) => {
    resolvePending = resolve
    navigate()
    // 안전장치: 라우터가 응답하지 않아도 화면이 얼지 않게
    setTimeout(() => { resolvePending?.(); resolvePending = null }, 900)
  }))
  t.finished.finally(() => { delete document.documentElement.dataset.nav })
}

/** 새 페이지가 그려졌음을 알린다 (usePathname 변화 시 호출). */
export function settleNavigation() {
  resolvePending?.(); resolvePending = null
}
