-- 자율성 중심 응답 경로 전환(docs/agency-core-transition-plan.md) — 추가만 한다. 기존 표의 행·의미는 바꾸지 않는다.
-- 0단계: 호출별 출처. 어느 경로(turn-policy origin)에서 나온 호출인지 남겨 경로별 원가·지연을 비교한다.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS origin text;
-- 2단계: 상태 전이 원장. 서버가 승인·거부·보류한 변경 하나가 한 행. 값은 상태 필드의 전후이지 대화 원문이 아니다.
-- (session_id, trigger_key, seq) 가 고유해 같은 요청의 재시도가 효과를 두 번 남기지 못한다.
CREATE TABLE IF NOT EXISTS state_transitions (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  trigger_key text NOT NULL,
  seq integer NOT NULL CHECK (seq >= 0),
  policy_version text NOT NULL,
  engine text NOT NULL CHECK (engine IN ('legacy','agency')),
  revision_id uuid REFERENCES character_revisions(id) ON DELETE SET NULL,
  decision_id text,
  cause_message_id uuid,
  actor text NOT NULL,
  target text,
  field text NOT NULL,
  before jsonb,
  after jsonb,
  rule text NOT NULL,
  status text NOT NULL CHECK (status IN ('applied','rejected','held')),
  clock text NOT NULL CHECK (clock IN ('real','narrative')),
  world_version integer,
  relationship_version integer,
  runtime_version integer,
  outcome_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS state_transitions_trigger_uniq ON state_transitions(session_id, trigger_key, seq);
CREATE INDEX IF NOT EXISTS state_transitions_session_idx ON state_transitions(session_id, created_at DESC);
ALTER TABLE state_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON state_transitions FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON state_transitions FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON state_transitions FROM authenticated; END IF;
END $$;
-- 3단계: 기억 후처리 작업. 응답 트랜잭션이 메시지와 함께 남기고, 워커가 세션 안 순서대로 추출·요약한다.
-- 재시도는 through_turn 까지의 대화만 입력으로 쓴다. (session_id, message_id, kind) 고유 — 같은 턴을 두 번 추출하지 않는다.
CREATE TABLE IF NOT EXISTS memory_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid,
  message_id uuid NOT NULL,
  through_turn integer NOT NULL CHECK (through_turn >= 0),
  kind text NOT NULL CHECK (kind IN ('memory_extraction','memory_summary')),
  version text NOT NULL DEFAULT 'memory-job:v1',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','cancelled','superseded')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS memory_jobs_message_uniq ON memory_jobs(session_id, message_id, kind);
CREATE INDEX IF NOT EXISTS memory_jobs_due_idx ON memory_jobs(next_attempt_at) WHERE status IN ('pending','running');
CREATE INDEX IF NOT EXISTS memory_jobs_session_idx ON memory_jobs(session_id, through_turn, created_at);
ALTER TABLE memory_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON memory_jobs FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON memory_jobs FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON memory_jobs FROM authenticated; END IF;
END $$;
