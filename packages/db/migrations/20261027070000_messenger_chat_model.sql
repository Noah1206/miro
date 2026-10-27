-- Additive and nullable: existing queued messages retain their original default routing.
SET LOCAL lock_timeout = '5s';
ALTER TABLE messenger_inbox ADD COLUMN IF NOT EXISTS chat_model text;
