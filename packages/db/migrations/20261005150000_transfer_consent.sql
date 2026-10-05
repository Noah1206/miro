-- 개인정보 국외 이전 별도 동의(2026-10-05): 약관·처리방침 동의와 따로 받는다(개인정보 보호법 제28조의8). 값은 동의한 처리방침 버전.
-- NULL = 아직 따로 동의하지 않은 기존 회원 — 다음 진입 때 /onboarding/transfer 에서 받는다.
ALTER TABLE terms_consents ADD COLUMN IF NOT EXISTS transfer_version text;
