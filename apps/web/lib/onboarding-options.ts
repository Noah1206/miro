/** 온보딩 화면(클라이언트)과 저장(서버)이 함께 쓰는 값. DB 를 읽지 않는 파일로 둔다. */
export const ONBOARDING_STEPS = 5
/** 필수 동의 — 없으면 가입이 끝나지 않는다. */
/** 캐릭터 알림(push)도 필수(2026-10-01 결정, 예외 없음) — 서버는 체크만 보고, 브라우저 허용·구독은 온보딩 화면이 끝까지 확인한다. */
/** 가입은 생년월일로 청소년 보호법 기준 성인(만 19세)인지 확인한다(11/8). 본인인증은 언베일에서 별도로 한다. */
/** 개인정보 국외 이전(transfer)도 필수 — 약관·처리방침과 따로 받는 동의(개인정보 보호법 제28조의8, 10/5). 동의 기록은 terms_consents.transfer_version. */
// 11/13 사용자: 캐릭터 알림(push)은 필수에서 선택으로 — 가입 중 이탈이 컸다(아카 유입 10명 중 5명이 가입 단계에서 멈춤). 10/1 '예외 없이 필수' 결정을 뒤집는다.
export const REQUIRED_TERMS = ['terms', 'privacy', 'transfer', 'ai'] as const
/** 가입 보상을 준 직후 한 번 환영 시트를 띄우는 주소 표시. */
export const WELCOME_PARAM = 'welcome'
/** 11/13 가입을 마친 뒤 돌아갈 곳(로그인 전에 보던 화면)에 환영 표시를 붙인다 — 예전엔 늘 홈으로 보내 보던 작품을 잃었다. */
export const withWelcome = (path: string) => `${path}${path.includes('?') ? '&' : '?'}${WELCOME_PARAM}=1`
/** 주소로 받은 '돌아갈 곳' — 이 사이트 안의 경로만(가입 단계 화면은 제외), 아니면 홈. */
export const afterSignup = (next: string | null | undefined) => next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/onboarding') && !next.startsWith('/login') ? next : '/home'
/**
 * 11/13 사용자: 알림을 켜자는 시트는 로그인에 성공한 직후에만 — 그냥 들어왔을 때(이미 로그인된 채 다시 방문 포함)는 절대 띄우지 않는다.
 * 로그인 콜백이 이 쿠키를 잠깐 심고, 알림 시트가 읽은 뒤 바로 지운다(화면에서 읽어야 해서 httpOnly 아님, 값은 표시일 뿐).
 */
export const JUST_SIGNED_IN_COOKIE = 'miro_just_in'
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
