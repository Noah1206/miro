SET lock_timeout = '3s';
CREATE INDEX CONCURRENTLY IF NOT EXISTS characters_visible_recent_idx
  ON public.characters (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND is_draft = false;
ANALYZE public.characters;
