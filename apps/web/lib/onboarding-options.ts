/** 온보딩 화면(클라이언트)과 저장(서버)이 함께 쓰는 값. DB 를 읽지 않는 파일로 둔다. */
export const ONBOARDING_STEPS = 6
export const TASTES = ['bl', 'hl', 'gl'] as const
export type Taste = (typeof TASTES)[number]
/** 필수 동의 — 없으면 가입이 끝나지 않는다. */
/** 캐릭터 알림(push)도 필수(2026-10-01 결정, 예외 없음) — 서버는 체크만 보고, 브라우저 허용·구독은 온보딩 화면이 끝까지 확인한다. */
/** 만 18세 확인(age)도 필수 — 약관 제4조(18세 이상만 가입)를 가입 화면에서 지킨다(10/3 점검). */
/** 개인정보 국외 이전(transfer)도 필수 — 약관·처리방침과 따로 받는 동의(개인정보 보호법 제28조의8, 10/5). 동의 기록은 terms_consents.transfer_version. */
export const REQUIRED_TERMS = ['age', 'terms', 'privacy', 'transfer', 'ai', 'push'] as const
/** 가입 보상을 준 직후 한 번 환영 시트를 띄우는 주소 표시. */
export const WELCOME_PARAM = 'welcome'
/**
 * 가입 직후 순서(2026-09-30 요청): 알림 시트가 먼저, 가입 선물 팝업은 그 뒤. 알림 쪽이 끝나면(보여 주고 닫았거나 물을 게 없었다)
 * 창에 표시를 남기고 이벤트를 보낸다 — 팝업은 표시를 보거나 이벤트를 기다린다.
 */
export const PUSH_PROMPT_DONE_EVENT = 'miro:push-prompt-done'
type PromptWindow = Window & { __miroPushPromptDone?: boolean }
export function markPushPromptDone(): void {
  const w = window as PromptWindow
  if (w.__miroPushPromptDone) return
  w.__miroPushPromptDone = true
  window.dispatchEvent(new Event(PUSH_PROMPT_DONE_EVENT))
}
export function pushPromptDone(): boolean {
  return !!(window as PromptWindow).__miroPushPromptDone
}
