ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "sample_dialogue" jsonb DEFAULT '[]'::jsonb NOT NULL;
