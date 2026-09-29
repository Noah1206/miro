-- 첫 로그인 온보딩(2026-09-30 결정): 언어(설정), 닉네임·성별(페르소나로), 취향·생년월일(사용자), 선택 동의 두 개(설정).
-- 코드보다 먼저 적용한다 — 온보딩 저장과 계정 삭제가 이 컬럼을 쓴다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date date;
-- 좋아하는 관계 취향. 빈 배열 = 고르지 않음. 추천에 쓰기 전까지는 저장만 한다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tastes text[] NOT NULL DEFAULT '{}'
  CONSTRAINT users_tastes_known CHECK (tastes <@ ARRAY['bl', 'hl']::text[]);
-- 선택 동의. 광고성 정보 수신과 야간(21시~다음날 8시) 광고성 알림 수신은 각각 따로 받는다(정보통신망법 제50조).
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS night_marketing_consent_at timestamptz;
-- 앱 화면과 캐릭터의 말이 따르는 언어. 화면은 쿠키로 먼저 읽고, 앱 밖 연락처럼 요청이 없는 일은 이 값을 읽는다.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'ko'
  CONSTRAINT user_settings_language_known CHECK (language IN ('ko', 'en', 'ja', 'zh'));
