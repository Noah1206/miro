-- 오리지널 스토리 연락석 발송(10/15). 5분마다 때가 된 예약만 본다 — 실제 발송 여부는 발송 직전 게이트가 정한다.
-- 마이그레이션 중 네트워크 호출은 없다. ops_cron_config 가 없는 DB(로컬·테스트)에서는 아무것도 하지 않는다.
DO $$
DECLARE base text; secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN RETURN; END IF;
  SELECT value INTO base FROM ops_cron_config WHERE key = 'base_url';
  SELECT value INTO secret FROM ops_cron_config WHERE key = 'secret';
  IF coalesce(base, '') = '' OR coalesce(secret, '') = '' THEN RETURN; END IF;
  PERFORM cron.schedule('miro-story-contacts', '*/5 * * * *', format(
    $job$ SELECT net.http_get(url := %L, headers := jsonb_build_object('Authorization', %L), timeout_milliseconds := 120000) $job$,
    base || '/api/cron/reality?work=story', 'Bearer ' || secret));
END $$;
