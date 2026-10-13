CREATE TABLE IF NOT EXISTS bank_telegram_requests (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES bank_transfer_orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  message_id integer
);
CREATE INDEX IF NOT EXISTS bank_telegram_requests_pending_idx ON bank_telegram_requests(sent_at, created_at);
ALTER TABLE bank_telegram_requests ENABLE ROW LEVEL SECURITY;
