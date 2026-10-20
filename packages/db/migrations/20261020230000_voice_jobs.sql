-- 유튜브 링크로 목소리 만들기 작업(10/20). 관리자 콘솔 /voices 가 행을 만들고, 맥북 워커(tooling/voice/worker.ts)가 집어
-- 다운로드·슬라이스·전사 → 파인튜닝 → 설치 → official_voices 등록까지 돌린 뒤 상태·로그를 여기에 쓴다.
CREATE TABLE IF NOT EXISTS public.voice_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id text NOT NULL UNIQUE,
  label text NOT NULL,
  source_urls jsonb NOT NULL,
  rights jsonb NOT NULL DEFAULT '{"basis":"unverified","holder":"","evidence":""}'::jsonb,
  requested_by text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  stage text NOT NULL DEFAULT '',
  log text NOT NULL DEFAULT '',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS voice_jobs_status_idx ON public.voice_jobs (status, created_at);
ALTER TABLE public.voice_jobs ENABLE ROW LEVEL SECURITY;
