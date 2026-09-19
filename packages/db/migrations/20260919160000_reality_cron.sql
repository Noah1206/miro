-- 리얼리티 스케줄러 크론 — 15분마다 /api/cron/reality 를 부른다.
--
-- 이 잡 하나가 네 경로를 돌린다: 먼저 연락 발송, 계좌이체 정산, 구독 만료 안내, 통화 만료.
-- 지금까지 이 스케줄은 DB 에만 있고 저장소에 없었다 — DB 를 복구하거나 옮기면 잡이
-- 조용히 사라지고, 네 경로가 오류 없이 멈춘다. 그래서 마이그레이션으로 남긴다.
--
-- 호스트와 시크릿은 코드에 두지 않는다. 아래 표에 한 번 넣으면 이 마이그레이션이
-- (재실행해도) 같은 잡을 만든다. 시크릿은 Vercel 의 CRON_SECRET 과 같아야 한다.
--
--   insert into ops_cron_config (key, value) values
--     ('base_url', 'https://<호스트>'), ('secret', '<CRON_SECRET>')
--   on conflict (key) do update set value = excluded.value;
--
-- 값이 없으면 잡을 만들지 않고 경고만 남긴다 — 빈 Authorization 으로 15분마다 401 을
-- 때리는 잡을 만드는 것보다 없는 편이 낫다.

CREATE TABLE IF NOT EXISTS "ops_cron_config" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- 크론 시크릿이 들어가는 표다. 앱의 익명·인증 역할에는 절대 열지 않는다.
ALTER TABLE "ops_cron_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "ops_cron_config" FROM PUBLIC;--> statement-breakpoint

DO $$
DECLARE
  base text;
  secret text;
BEGIN
  SELECT value INTO base FROM ops_cron_config WHERE key = 'base_url';
  SELECT value INTO secret FROM ops_cron_config WHERE key = 'secret';

  IF base IS NULL OR secret IS NULL OR base = '' OR secret = '' THEN
    RAISE WARNING 'reality cron: ops_cron_config 미설정 — 잡을 만들지 않는다';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE WARNING 'reality cron: pg_cron 확장이 없다 — 잡을 만들지 않는다';
    RETURN;
  END IF;

  -- 같은 이름이면 덮어쓴다. 재실행해도 잡이 늘지 않는다.
  PERFORM cron.schedule('miro-reality-scheduler', '*/15 * * * *', format(
    $job$ SELECT net.http_get(
      url := %L,
      headers := jsonb_build_object('Authorization', %L),
      timeout_milliseconds := 120000) $job$,
    base || '/api/cron/reality',
    'Bearer ' || secret));
END $$;
