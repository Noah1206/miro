-- 로어북. 캐릭터가 아는 배경 지식 — 불렸을 때만 프롬프트에 실린다.
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "lore" jsonb NOT NULL DEFAULT '[]'::jsonb;
