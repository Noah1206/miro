-- 11/17 유저노트 보관함(베이비챗식) — 회원이 노트를 여러 개 저장해 두고 대화방마다 하나를 골라 적용한다(적용하면 roleplay_sessions.user_note 로 복사).
CREATE TABLE IF NOT EXISTS user_note_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 40),
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_note_presets_user_idx ON user_note_presets (user_id, updated_at DESC);
