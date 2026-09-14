-- Production Core Architecture: Usage Manager 표, 캐릭터 상태, 게스트 계정. 알파 전용 표는 정식 모델로 흡수되어 지운다.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "session_id" uuid,
  "ip" text,
  "task" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "estimated_cost" numeric(12, 8) DEFAULT '0' NOT NULL,
  "latency_ms" integer NOT NULL,
  "ok" boolean NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_created_idx" ON "ai_usage" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_user_idx" ON "ai_usage" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_ip_idx" ON "ai_usage" ("ip", "created_at");
--> statement-breakpoint
ALTER TABLE "roleplay_sessions" ADD COLUMN IF NOT EXISTS "character_state" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_guest" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "alpha_waitlist" DROP COLUMN IF EXISTS "session_id";
--> statement-breakpoint
ALTER TABLE "alpha_waitlist" ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
DROP TABLE IF EXISTS "alpha_ai_calls";
--> statement-breakpoint
DROP TABLE IF EXISTS "alpha_sessions";
