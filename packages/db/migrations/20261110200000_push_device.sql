-- 11/10 같은 기기의 중복 구독 정리용 표시(알림 서비스 + 기기 종류).
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS device text;
