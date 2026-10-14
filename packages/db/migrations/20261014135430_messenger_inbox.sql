-- Durable inbound messenger delivery; the scene turn pipeline does not own reception.
CREATE TABLE messenger_inbox (
  message_id uuid PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES roleplay_sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','replied','left')),
  read_at timestamptz,
  next_review_at timestamptz NOT NULL,
  lease_until timestamptz,
  lease_token uuid,
  contact_id uuid REFERENCES reality_contacts(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'unread' AND read_at IS NULL) OR (status <> 'unread' AND read_at IS NOT NULL))
);
CREATE INDEX messenger_inbox_due_idx ON messenger_inbox(next_review_at, session_id) WHERE status IN ('unread','read');
CREATE INDEX messenger_inbox_session_idx ON messenger_inbox(session_id);
ALTER TABLE messenger_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON messenger_inbox FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON messenger_inbox FROM anon, authenticated;
  END IF;
END $$;

-- Messenger work needs a finer wakeup than the general 15-minute relationship sweep.
-- Keep credentials in the existing ops config; no network calls happen during migration.
DO $$
DECLARE base text; secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN; END IF;
  SELECT value INTO base FROM ops_cron_config WHERE key = 'base_url';
  SELECT value INTO secret FROM ops_cron_config WHERE key = 'secret';
  IF coalesce(base, '') = '' OR coalesce(secret, '') = '' THEN RETURN; END IF;
  PERFORM cron.schedule('miro-messenger-inbox', '* * * * *', format(
    $job$ SELECT net.http_get(url := %L, headers := jsonb_build_object('Authorization', %L), timeout_milliseconds := 120000) $job$,
    base || '/api/cron/reality?work=messenger', 'Bearer ' || secret));
END $$;
