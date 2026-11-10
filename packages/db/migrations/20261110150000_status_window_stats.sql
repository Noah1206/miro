-- 11/10 상태창·스탯(크랙 INFO 블록·스탯 설정) — 작품이 형식과 스탯을 정하면 매 답변 끝에 상태창이 붙고, 대화방마다 스탯 값이 움직인다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS status_format text NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS stat_values jsonb NOT NULL DEFAULT '{}'::jsonb;
