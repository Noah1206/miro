CREATE INDEX IF NOT EXISTS "messages_archive_preview_idx"
  ON "messages" ("session_id", "created_at" DESC, "id" DESC)
  WHERE "hidden_at" IS NULL;
