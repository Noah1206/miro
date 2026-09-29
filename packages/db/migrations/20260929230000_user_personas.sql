-- 사용자 페르소나(2026-09-29 결정): 채팅을 처음 진행할 때 만든다. 캐릭터가 대화에서 알게 되는 사용자의 자기 설정.
-- 사용자당 하나(여러 개를 골라 쓰는 기능은 필요해지면). 계정 삭제 때 지운다(lib/ops/account). 코드보다 먼저 적용한다 —
-- 채팅·문자 화면이 이 표를 읽는다.
CREATE TABLE IF NOT EXISTS user_personas (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 12),
  gender text CHECK (gender IN ('female', 'male')),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- 브라우저는 Data API 를 쓰지 않는다(0013) — 심층 방어로 RLS 만 켜고 정책은 두지 않는다.
ALTER TABLE user_personas ENABLE ROW LEVEL SECURITY;
