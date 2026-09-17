-- 기억 그래프. 태그가 겹치는 기억끼리 연결된다 — 엣지 표를 따로 두지 않는다.
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_tags_idx" ON "memories" USING gin ("tags");
