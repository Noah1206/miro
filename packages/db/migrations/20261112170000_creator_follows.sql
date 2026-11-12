-- 11/12 크리에이터 팔로우 — creator_key 는 회원 id(uuid 문자열) 또는 운영 작품 필명('pen:달무리'). (팔로워, 키) 한 쌍에 한 줄.
CREATE TABLE IF NOT EXISTS creator_follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_key text NOT NULL CHECK (length(creator_key) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, creator_key)
);
CREATE INDEX IF NOT EXISTS creator_follows_creator_idx ON creator_follows (creator_key);
