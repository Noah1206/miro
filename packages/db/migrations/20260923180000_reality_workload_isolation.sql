DO $$
DECLARE
  base text;
  secret text;
BEGIN
  SELECT value INTO base FROM ops_cron_config WHERE key = 'base_url';
  SELECT value INTO secret FROM ops_cron_config WHERE key = 'secret';
  IF base IS NULL OR secret IS NULL OR base = '' OR secret = '' THEN
    RAISE WARNING 'reality workload cron: ops_cron_config missing';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'reality workload cron: pg_cron unavailable';
    RETURN;
  END IF;
  PERFORM cron.schedule('miro-reality-scheduler', '*/15 * * * *', format(
    $job$ SELECT net.http_get(url := %L, headers := jsonb_build_object('Authorization', %L), timeout_milliseconds := 120000) $job$,
    base || '/api/cron/reality?work=ai', 'Bearer ' || secret));
  PERFORM cron.schedule('miro-reality-maintenance', '*/15 * * * *', format(
    $job$ SELECT net.http_get(url := %L, headers := jsonb_build_object('Authorization', %L), timeout_milliseconds := 120000) $job$,
    base || '/api/cron/reality/maintenance', 'Bearer ' || secret));
END $$;
