CREATE TABLE IF NOT EXISTS "generated_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"character_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"cache_key" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"visual_identity_id" uuid,
	"visual_identity_version" integer,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_media" ADD CONSTRAINT "generated_media_session_id_roleplay_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."roleplay_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_media" ADD CONSTRAINT "generated_media_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generated_media" ADD CONSTRAINT "generated_media_visual_identity_id_character_visual_identities_id_fk" FOREIGN KEY ("visual_identity_id") REFERENCES "public"."character_visual_identities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_cache_idx" ON "generated_media" USING btree ("character_id","kind","cache_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_session_idx" ON "generated_media" USING btree ("session_id","created_at");