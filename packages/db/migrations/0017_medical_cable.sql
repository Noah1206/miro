ALTER TABLE "character_comments" ADD COLUMN IF NOT EXISTS "parent_id" uuid;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "character_comment_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character_comment_likes" ADD CONSTRAINT "character_comment_likes_comment_id_character_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."character_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character_comment_likes" ADD CONSTRAINT "character_comment_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "character_comments" ADD CONSTRAINT "character_comments_parent_id_character_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."character_comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "character_comment_likes_uniq" ON "character_comment_likes" USING btree ("user_id","comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "character_comment_likes_comment_idx" ON "character_comment_likes" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "character_comments_parent_idx" ON "character_comments" USING btree ("parent_id");
--> statement-breakpoint
-- 새 테이블도 Data API 잠금 정책을 따른다 (0013 참고) — anon/authenticated 는 접근할 수 없고 RLS 를 켠다.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on "character_comment_likes" from anon, authenticated;
  end if;
end $$;
--> statement-breakpoint
alter table "character_comment_likes" enable row level security;
