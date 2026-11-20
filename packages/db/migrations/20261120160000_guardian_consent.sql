-- 11/20 만 14세 미만 가입(법정대리인 동의) — 가입 때 '만 14세 미만'을 고른 회원은 보호자 본인인증을 마쳐야 서비스를 쓴다.
-- 보호자 정보는 남기지 않는다: 동의한 시각과 보호자 DI 의 해시('sha256:'+hex)만(같은 보호자가 여러 자녀에게 동의할 수 있어 고유하지 않다).
ALTER TABLE users ADD COLUMN IF NOT EXISTS under14 boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_consent_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_consent_di text;
