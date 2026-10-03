-- 크론 작업이 마지막으로 끝난 시각(2026-10-03). /api/health 가 오래되면 실패로 알린다 — 크론이 멈추면 경보(크론이 보내는)도 멈추기 때문.
CREATE TABLE IF NOT EXISTS ops_heartbeats (
  name text PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ops_heartbeats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops_heartbeats FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON ops_heartbeats FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON ops_heartbeats FROM authenticated; END IF;
END $$;
