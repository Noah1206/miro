-- Application-owned data: access only through authenticated server endpoints.
ALTER TABLE users ADD COLUMN allow_training boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN allow_evaluation boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN ai_consent_version text;
ALTER TABLE users ADD COLUMN ai_consent_at timestamptz;
ALTER TABLE usage_windows ADD COLUMN period text NOT NULL DEFAULT 'legacy';
ALTER TABLE usage_windows ALTER COLUMN period SET DEFAULT 'monthly';
ALTER TABLE usage_windows ADD COLUMN policy_version text NOT NULL DEFAULT 'monthly-v1-dev';
ALTER TABLE usage_windows ADD COLUMN continuity_consumed integer NOT NULL DEFAULT 0 CHECK (continuity_consumed >= 0);
ALTER TABLE usage_ledger ADD COLUMN continuity boolean NOT NULL DEFAULT false;
ALTER TABLE ai_usage ADD COLUMN attempt_id uuid UNIQUE;
ALTER TABLE ai_usage ADD COLUMN trace_id uuid;
ALTER TABLE ai_usage ADD COLUMN request_id uuid;
ALTER TABLE ai_usage ADD COLUMN model_id text;
ALTER TABLE ai_usage ADD COLUMN model_version text;
ALTER TABLE ai_usage ADD COLUMN prompt_version text;
ALTER TABLE ai_usage ADD COLUMN usage_units integer NOT NULL DEFAULT 0 CHECK (usage_units >= 0);
ALTER TABLE ai_usage ADD COLUMN actual_cost numeric(12,8);
ALTER TABLE ai_usage ADD COLUMN reserved_cost numeric(12,8) NOT NULL DEFAULT 0 CHECK (reserved_cost >= 0);
ALTER TABLE ai_usage ADD COLUMN budget_keys jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ai_usage ADD COLUMN status text NOT NULL DEFAULT 'completed';
ALTER TABLE ai_usage ADD COLUMN fallback_used boolean NOT NULL DEFAULT false;
ALTER TABLE ai_usage ADD COLUMN shadow boolean NOT NULL DEFAULT false;
ALTER TABLE ai_usage ALTER COLUMN estimated_cost DROP NOT NULL;
ALTER TABLE ai_usage ALTER COLUMN estimated_cost DROP DEFAULT;
CREATE INDEX ai_usage_trace_idx ON ai_usage(trace_id);
CREATE INDEX ai_usage_model_time_idx ON ai_usage(model_id, created_at);
CREATE TABLE ai_budget_counters (
  key text PRIMARY KEY, requests integer NOT NULL DEFAULT 0 CHECK(requests >= 0),
  cost numeric(16,8) NOT NULL DEFAULT 0 CHECK(cost >= 0), expires_at timestamptz NOT NULL
);
CREATE TABLE conversation_requests (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  input_hash text NOT NULL, status text NOT NULL DEFAULT 'pending', result jsonb,
  lease_until timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_requests_session_idx ON conversation_requests(session_id, status);
CREATE INDEX conversation_requests_user_idx ON conversation_requests(user_id);
CREATE TABLE ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES conversation_requests(id) ON DELETE CASCADE,
  signal text NOT NULL, consent_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_feedback_user_idx ON ai_feedback(user_id);
CREATE INDEX ai_feedback_request_idx ON ai_feedback(request_id);
ALTER TABLE ai_budget_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ai_budget_counters, conversation_requests, ai_feedback FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ai_budget_counters, conversation_requests, ai_feedback FROM authenticated;
  END IF;
END $$;

CREATE TABLE ai_evaluation_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES conversation_requests(id) ON DELETE CASCADE,
  consent_version text NOT NULL, content jsonb NOT NULL, review_status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_evaluation_samples_user_idx ON ai_evaluation_samples(user_id);
CREATE UNIQUE INDEX ai_evaluation_samples_request_idx ON ai_evaluation_samples(request_id);
ALTER TABLE ai_evaluation_samples ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON ai_evaluation_samples FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON ai_evaluation_samples FROM authenticated; END IF;
END $$;

CREATE UNIQUE INDEX usage_windows_monthly_uniq ON usage_windows(user_id, started_at) WHERE period = 'monthly';

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
