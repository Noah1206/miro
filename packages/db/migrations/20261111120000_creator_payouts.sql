-- 11/11 창작 보상 출금 신청 — 신청 때 토큰을 빼고(ledger_id) 운영자가 송금 후 paid 로 표시. 주민등록번호는 암호화된 값만.
CREATE TABLE IF NOT EXISTS creator_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  tokens integer NOT NULL,
  gross_krw integer NOT NULL,
  income_tax_krw integer NOT NULL,
  local_tax_krw integer NOT NULL,
  net_krw integer NOT NULL,
  real_name text NOT NULL,
  rrn_sealed text NOT NULL,
  bank text NOT NULL,
  account_number text NOT NULL,
  ledger_id uuid NOT NULL REFERENCES usage_ledger(id),
  status text NOT NULL DEFAULT 'requested',
  note text NOT NULL DEFAULT '',
  decided_by uuid REFERENCES admin_users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_payouts_user_idx ON creator_payouts (user_id, created_at);
CREATE INDEX IF NOT EXISTS creator_payouts_decided_idx ON creator_payouts (status, decided_at);
ALTER TABLE creator_payouts ENABLE ROW LEVEL SECURITY;
