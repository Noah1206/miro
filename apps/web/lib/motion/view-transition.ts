'use client'

/** Navigate immediately, without snapshot transitions or animation delays. */
export function startNavigation(_direction: 'forward' | 'back', navigate: () => void, destination?: string) {
  if (destination) window.dispatchEvent(new CustomEvent('miro:route-start', { detail: destination }))
  // 11/12 사용자(iPhone): 채팅방에서 입력하다가 뒤로 가면 대화 목록이 머리말 없이 어긋난 채 멈췄다 — 키보드가 열린 채(또는 닫히는 중에) 화면이 바뀌면
  // iOS 가 보이는 영역을 밀어 둔 상태로 남는다. 이동을 시작할 때 입력칸에서 손을 떼 키보드부터 닫는다.
  const active = document.activeElement
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) active.blur()
  navigate()
}

/** Retained for existing layout callers; navigation no longer waits for settlement. */
export function settleNavigation() {}

/**
 * 11/21 사용자: < 는 무조건 바로 전에 있던 페이지로. 이 탭에서 앱 안으로 몇 칸 들어왔는지 센다 —
 * 새 페이지로 가면 +1, 브라우저 뒤로(popstate)로 돌아오면 -1. 0 이면(주소로 바로 들어옴·새로고침) 뒤로 갈 앱 안 페이지가 없다.
 * 주소만 바꾸는 ?menu 같은 이동은 페이지가 바뀌지 않아 세지 않는다.
 */
let depth = 0
let poppedAt = 0
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { poppedAt = Date.now() })
export function notePageChange() { if (Date.now() - poppedAt < 1500) { depth = Math.max(0, depth - 1); poppedAt = 0 } else depth++ }
export const canGoBack = () => depth > 0
