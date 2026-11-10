-- 11/10 다인 작품 인물별 프로필 사진 { 이름: 사진 URL } — 대화방 말풍선 아바타.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS ensemble_photos jsonb NOT NULL DEFAULT '{}'::jsonb;
