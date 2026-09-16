-- 홈(일반 캐릭터챗)과 미로(Reality 전용)를 캐릭터 유형으로 가른다.
-- 기존 캐릭터는 전부 'chat' 으로 남는다 — 일괄 편입하지 않는다. 미로 대상은 운영 콘솔에서 지정한다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS experience_type text NOT NULL DEFAULT 'chat';

ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_experience_type_check;
ALTER TABLE characters ADD CONSTRAINT characters_experience_type_check
  CHECK (experience_type IN ('chat', 'reality'));

CREATE INDEX IF NOT EXISTS characters_experience_idx ON characters (experience_type);

-- 유형 지정은 감사 로그에 남긴다.
ALTER TABLE admin_actions ADD COLUMN IF NOT EXISTS character_id uuid REFERENCES characters(id) ON DELETE SET NULL;
