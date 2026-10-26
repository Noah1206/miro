-- Voice seconds are separate from signup/chat tokens. Server-only access.
CREATE TABLE speech_credit_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('trial','purchase')),
 reference text NOT NULL UNIQUE,
 seconds integer NOT NULL CHECK(seconds > 0 AND seconds <= 3600),
 consumed integer NOT NULL DEFAULT 0 CHECK(consumed >= 0),
 reserved integer NOT NULL DEFAULT 0 CHECK(reserved >= 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(consumed + reserved <= seconds)
);
CREATE UNIQUE INDEX speech_trial_once_idx ON speech_credit_grants(user_id) WHERE kind='trial';
CREATE INDEX speech_grants_user_idx ON speech_credit_grants(user_id,created_at);
CREATE TABLE speech_credit_allocations (
 job_id uuid NOT NULL,
 grant_id uuid NOT NULL REFERENCES speech_credit_grants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 seconds integer NOT NULL CHECK(seconds > 0),
 charged integer NOT NULL DEFAULT 0 CHECK(charged BETWEEN 0 AND seconds),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','committed','refunded')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(job_id,grant_id)
);
CREATE INDEX speech_allocations_user_idx ON speech_credit_allocations(user_id,created_at);
ALTER TABLE speech_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE speech_credit_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON speech_credit_grants,speech_credit_allocations FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON speech_credit_grants,speech_credit_allocations FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON speech_credit_grants,speech_credit_allocations FROM authenticated; END IF;
END $$;
