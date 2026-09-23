SET LOCAL lock_timeout = '3s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.characters OFFSET 10000 LIMIT 1) THEN
    RAISE EXCEPTION 'public feed index requires CREATE INDEX CONCURRENTLY above 10000 rows';
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS characters_visible_recent_idx
  ON public.characters (created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND is_draft = false;
