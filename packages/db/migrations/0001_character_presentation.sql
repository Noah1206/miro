ALTER TABLE "characters" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "relationship_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "accent_a" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "accent_b" text;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_slug_unique" UNIQUE("slug");