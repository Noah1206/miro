-- Server-only, bounded short-utterance queue/cache. No Data API access.
CREATE TABLE speech_synthesis_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
 message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 cache_key text NOT NULL UNIQUE,
 part integer NOT NULL CHECK(part BETWEEN -1 AND 11),
 model_version text NOT NULL,
 reference_version text NOT NULL,
 payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','done','failed','uncertain')),
 reservation_micro_usd bigint NOT NULL CHECK(reservation_micro_usd > 0),
 lease_token uuid,
 lease_until timestamptz,
 audio bytea CHECK(octet_length(audio) <= 4194304),
 content_type text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX speech_jobs_due_idx ON speech_synthesis_jobs(created_at) WHERE state='queued';
CREATE INDEX speech_jobs_usage_idx ON speech_synthesis_jobs(user_id,created_at);
CREATE INDEX speech_jobs_daily_idx ON speech_synthesis_jobs(created_at);
CREATE INDEX speech_jobs_session_idx ON speech_synthesis_jobs(session_id);
CREATE INDEX speech_jobs_message_idx ON speech_synthesis_jobs(message_id);
ALTER TABLE speech_synthesis_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON speech_synthesis_jobs FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON speech_synthesis_jobs FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON speech_synthesis_jobs FROM authenticated; END IF;
END $$;

-- Independent cost/dispatch ledger: deleting a chat/account must not reset spend
-- or release a potentially still-running GPU. No text, audio or cascading FK.
CREATE TABLE speech_synthesis_usage (
 job_id uuid PRIMARY KEY,
 user_key text NOT NULL,
 reservation_micro_usd bigint NOT NULL CHECK(reservation_micro_usd > 0),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','uncertain','finished')),
 lease_token uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX speech_usage_user_idx ON speech_synthesis_usage(user_key,created_at);
CREATE INDEX speech_usage_daily_idx ON speech_synthesis_usage(created_at);
CREATE INDEX speech_usage_active_idx ON speech_synthesis_usage(state) WHERE state IN ('running','uncertain');
ALTER TABLE speech_synthesis_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON speech_synthesis_usage FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON speech_synthesis_usage FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON speech_synthesis_usage FROM authenticated; END IF;
END $$;
