-- 홈 남성향/여성향/전체 고르기(10/20). 지금 캐릭터는 모두 BL(여성향)이라 기본값 female.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'female';
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_audience_check;
ALTER TABLE characters ADD CONSTRAINT characters_audience_check CHECK (audience IN ('female', 'male'));
