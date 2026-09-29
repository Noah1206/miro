/** 온보딩 화면(클라이언트)과 저장(서버)이 함께 쓰는 값. DB 를 읽지 않는 파일로 둔다. */
export const ONBOARDING_STEPS = 6
export const TASTES = ['bl', 'hl'] as const
export type Taste = (typeof TASTES)[number]
/** 필수 동의 — 없으면 가입이 끝나지 않는다. */
export const REQUIRED_TERMS = ['terms', 'privacy', 'ai'] as const
/** 가입 보상을 준 직후 한 번 환영 시트를 띄우는 주소 표시. */
export const WELCOME_PARAM = 'welcome'
/** 환영 시트를 닫았다는 창 이벤트 — 알림 권한 시트가 그 뒤에 올라오게 기다린다. */
export const WELCOME_DONE_EVENT = 'miro:welcome-done'
