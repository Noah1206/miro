SET LOCAL lock_timeout = '5s';

-- 리롤(마지막 답 다시 받기, 10/27). 대화방마다 마지막 장면 턴 하나의 '되돌리기 기록' — 그 턴이 바꾸기 전 값과 그 턴의 메시지 id.
-- 다음 턴이 저장되면 덮어쓰고, 되돌리면 지운다. 서버만 읽는다(Data API 없음).
CREATE TABLE IF NOT EXISTS turn_undos (
 session_id uuid PRIMARY KEY REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
 turn_index integer NOT NULL,
 message_ids uuid[] NOT NULL,
 input text NOT NULL,
 before jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE turn_undos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON turn_undos FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON turn_undos FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON turn_undos FROM authenticated; END IF;
END $$;
