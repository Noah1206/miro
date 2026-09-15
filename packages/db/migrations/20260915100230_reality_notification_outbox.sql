CREATE TABLE reality_push_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES reality_contacts(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','cancelled','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reality_push_jobs_delivery_uniq ON reality_push_jobs(contact_id, subscription_id);
CREATE INDEX reality_push_jobs_due_idx ON reality_push_jobs(next_attempt_at) WHERE status IN ('pending','sending');
CREATE INDEX reality_push_jobs_subscription_idx ON reality_push_jobs(subscription_id);
ALTER TABLE reality_push_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON reality_push_jobs FROM PUBLIC, anon, authenticated;
