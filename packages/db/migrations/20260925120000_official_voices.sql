-- 공식 보이스 라이브러리. 운영자가 승인한 목소리만 들어오고, 캐릭터는 미로 내부 ID 로만 참조한다.
-- provider_voice_id 는 로컬 엔진(Chatterbox)이 만든 목소리 파일의 sha256 이다. 권한 기록이 있으므로 Data API(anon·authenticated)에는 열지 않는다.
-- 배포 전에 적용한다 — characters.voice_id 가 없으면 캐릭터를 전부 읽는 쿼리가 실패한다.
CREATE TABLE IF NOT EXISTS official_voices (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 30),
  provider text NOT NULL CHECK (provider IN ('chatterbox')),
  provider_voice_id text NOT NULL UNIQUE CHECK (provider_voice_id ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  samples jsonb NOT NULL,
  rights jsonb NOT NULL,
  approval jsonb NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);

ALTER TABLE characters ADD COLUMN IF NOT EXISTS voice_id text REFERENCES official_voices(id) ON DELETE SET NULL;

ALTER TABLE official_voices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON official_voices FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON official_voices FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON official_voices FROM authenticated; END IF;
END $$;
