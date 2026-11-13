-- 11/13 카드 결제 주문(포트원 V2 · KG이니시스). id = 포트원 paymentId.
CREATE TABLE IF NOT EXISTS card_payment_orders (
  id text PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  amount_minor integer NOT NULL,
  currency text NOT NULL,
  units integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  pg_tx_id text,
  failure_reason text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_payment_orders_user_idx ON card_payment_orders (user_id, created_at);
-- 다른 결제 테이블과 같이 브라우저(anon) 직접 접근을 막는다 — 서버만 읽고 쓴다.
ALTER TABLE card_payment_orders ENABLE ROW LEVEL SECURITY;
