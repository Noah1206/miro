CREATE INDEX IF NOT EXISTS "events_resolved_recent_idx"
  ON "events" ("session_id", "resolved_at_turn" DESC NULLS LAST, "id" DESC)
  WHERE "status" = 'resolved';

CREATE INDEX IF NOT EXISTS "events_resolved_cooldown_idx"
  ON "events" ("session_id", "cooldown_until_turn" DESC, "type", "id" DESC)
  WHERE "status" = 'resolved';
