-- 운영자 알림 상태(2026-09-29): 같은 알림을 몇 시간 안에 다시 보내지 않기 위한 마지막 발송 시각. 추가 테이블만.
CREATE TABLE IF NOT EXISTS ops_alerts (
  key text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL,
  detail text
);
ALTER TABLE ops_alerts ENABLE ROW LEVEL SECURITY;
