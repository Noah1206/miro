-- 캐릭터 사진. 첫 번째가 대표(카드·상세에서 쓰는) 사진이다. Supabase Storage 의 public URL 을 담는다.
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "images" jsonb DEFAULT '[]'::jsonb NOT NULL;
