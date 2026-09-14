-- Closed Alpha: 로그인 없는 체험. 쿠키 하나가 세션 하나다.
CREATE TABLE IF NOT EXISTS "alpha_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ip" text,
  "state" jsonb NOT NULL,
  "memories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "user_messages" integer DEFAULT 0 NOT NULL,
  "wow_at" timestamp with time zone,
  "reality_at" timestamp with time zone,
  "cliff_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- AI 호출 한 번 = 한 줄. 사용자·IP·전체 한도가 전부 이 표에서 나온다.
CREATE TABLE IF NOT EXISTS "alpha_ai_calls" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "alpha_sessions"("id") ON DELETE CASCADE,
  "ip" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alpha_ai_calls_created_idx" ON "alpha_ai_calls" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alpha_ai_calls_session_idx" ON "alpha_ai_calls" ("session_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alpha_ai_calls_ip_idx" ON "alpha_ai_calls" ("ip", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alpha_waitlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "session_id" uuid REFERENCES "alpha_sessions"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
