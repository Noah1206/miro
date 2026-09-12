CREATE TABLE IF NOT EXISTS "call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"result" text,
	"usage_reservation_id" uuid,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_session_id_roleplay_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."roleplay_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_sessions_one_ringing_per_session" ON "call_sessions" USING btree ("session_id") WHERE "call_sessions"."status" = 'ringing';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_sessions_session_idx" ON "call_sessions" USING btree ("session_id","created_at");