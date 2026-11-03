SET LOCAL lock_timeout = '5s';

-- 기억 노트(11/3): 사용자가 고정한 기억, 사용자가 직접 적은 기억. 지난 이야기는 type = 'chapter'(text 칸이라 바꿀 것 없음).
ALTER TABLE memories ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS by_user boolean NOT NULL DEFAULT false;
