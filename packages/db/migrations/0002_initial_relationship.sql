ALTER TABLE "characters" ADD COLUMN "initial_relationship" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "starting_time" text DEFAULT '저녁' NOT NULL;