CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"participant_npc_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"continuation_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consequences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cooldown_until_turn" integer DEFAULT 0 NOT NULL,
	"created_at_turn" integer NOT NULL,
	"resolved_at_turn" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"importance" integer NOT NULL,
	"persistence" integer NOT NULL,
	"confidence" integer NOT NULL,
	"source_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "npcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"knows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship_to_character" text DEFAULT '' NOT NULL,
	"relationship_to_user" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"location" text NOT NULL,
	"time" text NOT NULL,
	"mood" text DEFAULT '' NOT NULL,
	"weather" text DEFAULT '' NOT NULL,
	"scene_key" text NOT NULL,
	"background_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_session_id_roleplay_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."roleplay_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_session_id_roleplay_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."roleplay_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "npcs" ADD CONSTRAINT "npcs_session_id_roleplay_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."roleplay_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scenes" ADD CONSTRAINT "scenes_session_id_roleplay_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."roleplay_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_session_status_idx" ON "events" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_session_idx" ON "memories" USING btree ("session_id","importance");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "npcs_session_idx" ON "npcs" USING btree ("session_id","is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_session_key_idx" ON "scenes" USING btree ("session_id","scene_key");