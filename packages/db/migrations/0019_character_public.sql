ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "characters_public_idx" ON "characters" USING btree ("is_public");
