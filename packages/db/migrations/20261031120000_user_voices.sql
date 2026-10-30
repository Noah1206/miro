SET LOCAL lock_timeout = '5s';

-- 사용자 음성(10/31). 회원이 직접 읽은 녹음 한 개가 Drama 3 의 참조 목소리가 된다(학습 없음).
-- owner_id 가 null 이면 운영자가 등록한 공식 목소리, 아니면 그 회원의 목소리다.
-- pending = 녹음을 올렸지만 미리 듣고 등록하기 전. shared = 다른 회원도 캐릭터에 고를 수 있음. adult_allowed = 언베일 대화방에서도 읽음.
-- 기존 공식 목소리는 지금처럼 모두에게 열려 있고 언베일에서도 읽는다(기본값).
ALTER TABLE official_voices ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE official_voices ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;
ALTER TABLE official_voices ADD COLUMN IF NOT EXISTS adult_allowed boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS official_voices_owner_idx ON official_voices(owner_id) WHERE owner_id IS NOT NULL;

ALTER TABLE official_voices DROP CONSTRAINT IF EXISTS official_voices_provider_check;
ALTER TABLE official_voices ADD CONSTRAINT official_voices_provider_check CHECK (provider IN ('chatterbox', 'gpt-sovits', 'drama3'));
ALTER TABLE official_voices DROP CONSTRAINT IF EXISTS official_voices_status_check;
ALTER TABLE official_voices ADD CONSTRAINT official_voices_status_check CHECK (status IN ('pending', 'active', 'retired'));
