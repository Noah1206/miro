CREATE TABLE IF NOT EXISTS character_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS character_likes_uniq ON character_likes(character_id, user_id);
ALTER TABLE character_likes ENABLE ROW LEVEL SECURITY;
-- Access is through authenticated server actions, not the public Data API.
REVOKE ALL ON character_likes FROM anon, authenticated;
