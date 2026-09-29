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
