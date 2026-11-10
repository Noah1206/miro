-- 11/11 다인 작품 인물별 설정 — 만들기 화면에서 주인공 아래로 추가한 캐릭터들 [{ name, intro, age, mbti, nationality, occupation, jealousy, initiative, emotionalExpression }]. AI 지시문의 '함께 나오는 인물'로 실린다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS ensemble_cast jsonb NOT NULL DEFAULT '[]'::jsonb;
