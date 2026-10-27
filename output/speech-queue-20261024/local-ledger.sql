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
