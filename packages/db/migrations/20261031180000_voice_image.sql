SET LOCAL lock_timeout = '5s';

-- 목소리 프로필 사진(10/31) — 목소리 고르기 목록의 동그라미. 없으면 이름 첫 글자 + 색. 캐릭터 사진과 같은 저장소(character-images)의 공개 URL.
ALTER TABLE official_voices ADD COLUMN IF NOT EXISTS image_url text CHECK (image_url IS NULL OR length(image_url) <= 1000);
