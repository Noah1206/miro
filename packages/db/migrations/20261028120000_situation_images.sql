SET LOCAL lock_timeout = '5s';

-- 상황별 사진(10/28). 만들기 화면에서 키워드와 사진을 짝지어 넣고, 대화 중 키워드가 나오면 그 사진이 채팅에 뜬다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS situation_images jsonb NOT NULL DEFAULT '[]'::jsonb;
