-- 본인인증 DI 해시(2026-10-06): 한 사람은 한 계정만 성인 인증. NULL 은 여러 개 허용(Postgres 고유 색인).
ALTER TABLE users ADD COLUMN IF NOT EXISTS adult_verify_di text;
CREATE UNIQUE INDEX IF NOT EXISTS users_adult_verify_di_unique ON users (adult_verify_di);
