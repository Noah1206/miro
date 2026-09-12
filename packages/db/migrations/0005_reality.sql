CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reality_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"suppressed_reason" text,
	"message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contact_profiles" ADD COLUMN "presentation" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "pending_reality_intent" jsonb;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "reality_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN "character_status" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "time_zone" text DEFAULT 'Asia/Seoul' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reality_contacts" ADD CONSTRAINT "reality_contacts_session_id_roleplay_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."roleplay_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reality_contacts_session_dedupe_uniq" ON "reality_contacts" USING btree ("session_id","dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reality_contacts_session_status_idx" ON "reality_contacts" USING btree ("session_id","status","sent_at");