CREATE TABLE IF NOT EXISTS ai_provider_leases (
  token uuid PRIMARY KEY,
  provider text NOT NULL,
  workload text NOT NULL CHECK (workload IN ('interactive', 'background')),
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_provider_leases_expiry_idx ON ai_provider_leases (lease_until);
ALTER TABLE ai_provider_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_provider_leases FROM PUBLIC;
