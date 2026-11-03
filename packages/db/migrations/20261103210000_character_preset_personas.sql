SET LOCAL lock_timeout = '5s';

-- 만든 사람이 준비한 페르소나(11/3) — 이름·성별·소개. 대화 시작 화면에서 사용자가 골라 쓴다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS preset_personas jsonb NOT NULL DEFAULT '[]'::jsonb;
