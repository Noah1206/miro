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
