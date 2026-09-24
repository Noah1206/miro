-- Additive, private tables. Apply before opting any session into the agency cohort.
CREATE TABLE IF NOT EXISTS character_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  source_hash text NOT NULL,
  authored jsonb NOT NULL,
  profile jsonb NOT NULL,
  compiled jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','compiling','ready','failed')),
  compiler_version text NOT NULL DEFAULT 'agency-compiler:v1',
  provider_mode text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'ready' OR compiled IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS character_revisions_hash_uniq ON character_revisions(character_id, source_hash);
CREATE TABLE IF NOT EXISTS character_runtime_states (
  session_id uuid PRIMARY KEY REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES character_revisions(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('shadow','live')),
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  next_wake_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_runtime_states_due_idx ON character_runtime_states(next_wake_at) WHERE next_wake_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS character_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES character_revisions(id) ON DELETE CASCADE,
  trigger_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('shadow','live')),
  decision jsonb NOT NULL,
  provider_mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS character_decisions_trigger_uniq ON character_decisions(session_id, trigger_key);
ALTER TABLE character_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_runtime_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON character_revisions, character_runtime_states, character_decisions FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON character_revisions, character_runtime_states, character_decisions FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON character_revisions, character_runtime_states, character_decisions FROM authenticated;
  END IF;
END $$;
