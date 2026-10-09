-- 사용자가 말한 자기 일정(2026-10-09): "금요일에 면접 있어" → 전날 밤 응원, 끝난 뒤 "어땠어?". 세션마다, 서버가 거른 것만.
-- 캐릭터 상태 메시지가 바뀐 시각 — 메신저 머리·대화 목록이 '방금 바뀐' 상태를 보여 준다.
CREATE TABLE IF NOT EXISTS user_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  source_message_id uuid,
  about text NOT NULL CHECK (char_length(about) BETWEEN 1 AND 60),
  event_at timestamptz NOT NULL,
  has_time boolean NOT NULL DEFAULT false,
  cheer_at timestamptz,
  ask_at timestamptz NOT NULL,
  cheered_at timestamptz,
  asked_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, about, event_at)
);
CREATE INDEX IF NOT EXISTS user_moments_session_idx ON user_moments(session_id, event_at) WHERE status = 'active';
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS character_status_at timestamptz;
ALTER TABLE user_moments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON user_moments FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON user_moments FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON user_moments FROM authenticated; END IF;
END $$;
