-- 11/19 상황별 BGM — [{url, situation, name?}]. 상황이 빈 곡은 맞는 곡이 없을 때 나오는 기본 곡.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS bgm jsonb NOT NULL DEFAULT '[]'::jsonb;
