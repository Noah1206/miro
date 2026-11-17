-- 11/18 이벤트 쿠폰 — 프로필에서 코드를 넣으면 토큰(recharge_grants provider 'coupon', 계정당 한 번)을 준다.
CREATE TABLE IF NOT EXISTS coupons (
  code text PRIMARY KEY,
  units integer NOT NULL CHECK (units > 0),
  valid_days integer NOT NULL DEFAULT 7 CHECK (valid_days > 0),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses integer NOT NULL DEFAULT 0,
  ends_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
