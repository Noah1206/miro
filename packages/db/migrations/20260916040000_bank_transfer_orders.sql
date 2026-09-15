-- 계좌이체 주문. 사용자가 입금하겠다고 선언하면 여기 한 줄이 생기고,
-- 운영자가 실제 입금을 확인해 승인해야 지급된다. 주문 생성은 지급이 아니다.
--
-- 지급은 승인 시점에 payment_events 를 거쳐 일어난다 — 그쪽의
-- (provider, external_event_id) UNIQUE 가 이중 지급을 막는 단일 지점이다.
CREATE TABLE IF NOT EXISTS bank_transfer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 무엇을 사는지. 'pass' 는 1개월 이용권, 'recharge' 는 충전 상품.
  kind text NOT NULL CHECK (kind IN ('pass', 'recharge')),
  -- 충전이면 서버 카탈로그의 상품 id. 이용권이면 NULL.
  product_id text,

  -- 주문 시점에 서버가 정한 금액과 지급량. 사용자가 보낸 값을 쓰지 않는다.
  -- 카탈로그가 나중에 바뀌어도 이 주문은 주문 당시 조건으로 처리된다.
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  units integer CHECK (units IS NULL OR units > 0),

  -- 입금자명. 같은 금액의 주문이 여럿일 때 어느 입금인지 가르는 유일한 단서다.
  depositor_name text NOT NULL CHECK (length(btrim(depositor_name)) BETWEEN 1 AND 40),
  -- 사용자가 주문 화면에서 확인하는 짧은 대조 코드. 입금자명 뒤에 붙여 달라고 안내한다.
  reference_code text NOT NULL UNIQUE,

  status text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'approved', 'rejected', 'expired')),
  -- 승인/거절한 운영자와 시각. 승인된 주문은 이 값이 반드시 있다.
  decided_by uuid REFERENCES admin_users(id),
  decided_at timestamptz,
  -- 거절 사유 또는 운영 메모. 승인에도 남길 수 있다.
  note text NOT NULL DEFAULT '',

  created_at timestamptz NOT NULL DEFAULT now(),
  -- 이 시각이 지나도 입금이 없으면 만료시킨다. 무기한 대기 주문을 남기지 않는다.
  expires_at timestamptz NOT NULL,

  -- 승인된 주문은 누가 언제 결정했는지가 반드시 남는다.
  CONSTRAINT bank_transfer_orders_decided_check
    CHECK (status = 'awaiting' OR status = 'expired' OR (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
  -- 충전 주문은 상품과 지급량을 갖고, 이용권 주문은 갖지 않는다.
  CONSTRAINT bank_transfer_orders_kind_fields_check
    CHECK ((kind = 'recharge' AND product_id IS NOT NULL AND units IS NOT NULL)
        OR (kind = 'pass' AND product_id IS NULL AND units IS NULL))
);

-- 운영자 목록: 입금 대기 주문을 오래된 것부터 본다.
CREATE INDEX IF NOT EXISTS bank_transfer_orders_status_idx
  ON bank_transfer_orders (status, created_at);
CREATE INDEX IF NOT EXISTS bank_transfer_orders_user_idx
  ON bank_transfer_orders (user_id, created_at DESC);

-- 한 사용자가 대기 중인 주문을 무한히 쌓지 못하게 한다. 입금 전 주문은 하나면 충분하다.
CREATE UNIQUE INDEX IF NOT EXISTS bank_transfer_orders_one_awaiting_idx
  ON bank_transfer_orders (user_id) WHERE status = 'awaiting';

-- 계좌이체 승인도 감사 로그에 남는다.
ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS bank_order_id uuid REFERENCES bank_transfer_orders(id) ON DELETE SET NULL;

-- 지급 완료 시각. 승인(운영 앱)과 지급(web cron)을 나눴으므로, 승인됐지만 아직
-- 지급되지 않은 주문을 이 컬럼이 가른다. NULL 이면 다음 cron 이 다시 시도한다.
ALTER TABLE bank_transfer_orders ADD COLUMN IF NOT EXISTS settled_at timestamptz;
CREATE INDEX IF NOT EXISTS bank_transfer_orders_unsettled_idx
  ON bank_transfer_orders (decided_at) WHERE status = 'approved' AND settled_at IS NULL;

-- 결제 관련 테이블과 같은 방침: RLS 를 켜고 정책을 두지 않는다. anon/authenticated 키로는
-- 한 줄도 읽거나 쓸 수 없고, 앱은 service role 로만 접근한다. 남의 입금 금액·입금자명·
-- 대조 코드가 클라이언트 키로 노출되지 않게 한다.
ALTER TABLE bank_transfer_orders ENABLE ROW LEVEL SECURITY;
