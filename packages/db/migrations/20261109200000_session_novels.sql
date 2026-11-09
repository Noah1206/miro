SET LOCAL lock_timeout = '5s';

-- 11/9 웹소설: 대화방이 결말에 닿으면(AI 가 '— ENDING · 이름 —' 을 씀) 그 결말을 남기고, 대화 전체를 화 단위 웹소설로 쓴다.
-- 결말은 처음 한 번만 남는다. chapters = [{ n, title, text, throughTurn }]. 서버만 읽는다(Data API 없음).
CREATE TABLE IF NOT EXISTS session_novels (
 session_id uuid PRIMARY KEY REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 ending_title text,
 ending_turn integer,
 ended_at timestamptz,
 chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
 free_used boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'writing', 'done')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE session_novels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON session_novels FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON session_novels FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON session_novels FROM authenticated; END IF;
END $$;
