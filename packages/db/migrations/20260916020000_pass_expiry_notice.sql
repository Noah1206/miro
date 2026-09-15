-- 이용권 만료 안내. 자동 갱신이 없으므로 기간이 끝나기 전에 알려야 이어서 쓸 수 있다.
-- 보낸 단계를 행에 남겨 재시도·중복 발송을 막는다 (cron 은 15분마다 돈다).
--   null  = 아직 안 보냄 / 'soon' = 만료 3일 전 안내함 / 'ended' = 만료 당일 안내함
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expiry_notice text;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_expiry_notice_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_expiry_notice_check
  CHECK (expiry_notice IS NULL OR expiry_notice IN ('soon', 'ended'));
