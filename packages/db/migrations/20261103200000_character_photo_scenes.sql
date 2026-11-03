SET LOCAL lock_timeout = '5s';

-- 만든 사람이 정하는 사진 장면(11/3) — 이름·설명(한국어)·언베일 여부·둘이 함께. 채팅 사진 시트에 기본 장면과 함께 나온다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS photo_scenes jsonb NOT NULL DEFAULT '[]'::jsonb;
