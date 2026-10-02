-- 캐릭터의 '자기 삶'(2026-10-02): 대화가 없는 동안 캐릭터가 겪은 일. 세션마다, 서버가 거른 것만. 사용자 대화 원문은 없다.
CREATE TABLE IF NOT EXISTS character_life_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL,
  block_label text NOT NULL CHECK (char_length(block_label) BETWEEN 1 AND 40),
  kind text NOT NULL CHECK (kind IN ('work','errand','social','hobby','rest','incident','thought')),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 200),
  valence real NOT NULL CHECK (valence BETWEEN -1 AND 1),
  intensity real NOT NULL CHECK (intensity BETWEEN 0 AND 1),
  shareable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_life_events_session_idx ON character_life_events(session_id, occurred_at);
ALTER TABLE character_runtime_states ADD COLUMN IF NOT EXISTS life_until timestamptz;
ALTER TABLE character_life_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON character_life_events FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON character_life_events FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON character_life_events FROM authenticated; END IF;
END $$;
