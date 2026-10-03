-- 언베일 수위(2026-10-03): 대화방마다 사용자가 메뉴에서 고른다. 기존 방은 노골적(지금까지의 기준)으로 둔다.
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS adult_level text NOT NULL DEFAULT 'explicit';
DO $$ BEGIN
  ALTER TABLE roleplay_sessions ADD CONSTRAINT roleplay_sessions_adult_level_check CHECK (adult_level IN ('soft', 'deep', 'explicit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
