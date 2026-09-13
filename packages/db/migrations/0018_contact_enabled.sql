ALTER TABLE "contact_profiles" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;
