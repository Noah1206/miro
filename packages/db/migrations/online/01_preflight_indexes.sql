SET lock_timeout = '3s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS worlds_character_order_idx
  ON public.worlds (character_id, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_active_character_user_idx
  ON public.roleplay_sessions (character_id, user_id) WHERE deleted_at IS NULL;
