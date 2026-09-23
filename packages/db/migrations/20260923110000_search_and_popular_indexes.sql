SET LOCAL lock_timeout = '3s';
DO $$
BEGIN
  IF current_setting('miro.allow_large_backfill', true) IS DISTINCT FROM '1' THEN
    PERFORM set_config('statement_timeout', '30s', true);
  END IF;
  IF current_setting('miro.online_phase', true) IS DISTINCT FROM 'schema'
    AND current_setting('miro.allow_large_backfill', true) IS DISTINCT FROM '1'
    AND (EXISTS (SELECT 1 FROM public.characters OFFSET 10000 LIMIT 1)
      OR EXISTS (SELECT 1 FROM public.roleplay_sessions OFFSET 10000 LIMIT 1)) THEN
    RAISE EXCEPTION 'search/popular migration requires a staged large-database backfill; refusing write lock above 10000 rows';
  END IF;
END;
$$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS miro_perf;
REVOKE ALL ON SCHEMA miro_perf FROM PUBLIC;
DO $$
BEGIN
  IF current_setting('miro.online_phase', true) IS DISTINCT FROM 'schema' THEN
    LOCK TABLE public.characters, public.worlds, public.roleplay_sessions IN SHARE ROW EXCLUSIVE MODE;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS miro_perf.character_search_docs (
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  world_id uuid REFERENCES public.worlds(id) ON DELETE CASCADE,
  search_text text NOT NULL,
  short_grams text[] NOT NULL DEFAULT '{}'::text[]
);
CREATE TABLE IF NOT EXISTS miro_perf.character_backfill_state (
  character_id uuid PRIMARY KEY REFERENCES public.characters(id) ON DELETE CASCADE
);
ALTER TABLE miro_perf.character_search_docs DROP CONSTRAINT IF EXISTS character_search_docs_pkey;
ALTER TABLE miro_perf.character_search_docs ADD COLUMN IF NOT EXISTS world_id uuid REFERENCES public.worlds(id) ON DELETE CASCADE;
ALTER TABLE miro_perf.character_search_docs ADD COLUMN IF NOT EXISTS short_grams text[] NOT NULL DEFAULT '{}'::text[];
CREATE UNIQUE INDEX IF NOT EXISTS character_search_docs_key_idx ON miro_perf.character_search_docs
  (character_id, coalesce(world_id, '00000000-0000-0000-0000-000000000000'::uuid));
DO $$
BEGIN
  IF current_setting('miro.online_phase', true) IS DISTINCT FROM 'schema' THEN
    CREATE INDEX IF NOT EXISTS worlds_character_order_idx ON public.worlds (character_id, id);
    CREATE INDEX IF NOT EXISTS sessions_active_character_user_idx ON public.roleplay_sessions (character_id, user_id)
      WHERE deleted_at IS NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION miro_perf.character_search_text(character_row public.characters, world_genre text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(concat_ws(' ', character_row.name, character_row.tagline,
    character_row.occupation, character_row.role, world_genre,
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(character_row.relationship_keywords)), ' ')),
    '[[:space:]]+', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION miro_perf.short_search_grams(input_text text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(array_agg(DISTINCT substr(input_text, position, span)), '{}'::text[])
  FROM generate_series(1, char_length(input_text)) position
  CROSS JOIN generate_series(1, 2) span
  WHERE position + span - 1 <= char_length(input_text);
$$;

CREATE OR REPLACE FUNCTION miro_perf.refresh_character_search(character_key uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(738224, hashtext(character_key::text));
  DELETE FROM miro_perf.character_search_docs WHERE character_id = character_key;
  INSERT INTO miro_perf.character_search_docs (character_id, world_id, search_text, short_grams)
  SELECT c.id, w.id, document.search_text, miro_perf.short_search_grams(document.search_text)
  FROM public.characters c
  LEFT JOIN public.worlds w ON w.character_id = c.id
  CROSS JOIN LATERAL (SELECT miro_perf.character_search_text(c, w.genre) AS search_text) document
  WHERE c.id = character_key;
END;
$$;

CREATE OR REPLACE FUNCTION miro_perf.character_search_character_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO miro_perf.character_backfill_state (character_id) VALUES (NEW.id)
    ON CONFLICT (character_id) DO NOTHING;
  END IF;
  PERFORM miro_perf.refresh_character_search(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS character_search_character_changed ON public.characters;
CREATE TRIGGER character_search_character_changed
AFTER INSERT OR UPDATE OF name, tagline, occupation, role, relationship_keywords ON public.characters
FOR EACH ROW EXECUTE FUNCTION miro_perf.character_search_character_changed();

CREATE OR REPLACE FUNCTION miro_perf.character_search_world_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM miro_perf.refresh_character_search(OLD.character_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.character_id IS DISTINCT FROM OLD.character_id THEN
    PERFORM miro_perf.refresh_character_search(OLD.character_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM miro_perf.refresh_character_search(NEW.character_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS character_search_world_changed ON public.worlds;
CREATE TRIGGER character_search_world_changed
AFTER INSERT OR UPDATE OF character_id, genre OR DELETE ON public.worlds
FOR EACH ROW EXECUTE FUNCTION miro_perf.character_search_world_changed();

DO $$
BEGIN
  IF current_setting('miro.online_phase', true) IS DISTINCT FROM 'schema' THEN
    TRUNCATE miro_perf.character_search_docs;
    INSERT INTO miro_perf.character_search_docs (character_id, world_id, search_text, short_grams)
    SELECT c.id, w.id, document.search_text, miro_perf.short_search_grams(document.search_text)
    FROM public.characters c
    LEFT JOIN public.worlds w ON w.character_id = c.id
    CROSS JOIN LATERAL (SELECT miro_perf.character_search_text(c, w.genre) AS search_text) document;
  END IF;
END;
$$;
DO $$
DECLARE
  opclass_schema text;
BEGIN
  IF current_setting('miro.online_phase', true) IS DISTINCT FROM 'schema' THEN
    SELECT namespace.nspname INTO opclass_schema
    FROM pg_opclass operator_class
    JOIN pg_namespace namespace ON namespace.oid = operator_class.opcnamespace
    WHERE operator_class.opcname = 'gin_trgm_ops';
    EXECUTE format('CREATE INDEX IF NOT EXISTS character_search_docs_trgm_idx ON miro_perf.character_search_docs USING gin (search_text %I.gin_trgm_ops)', opclass_schema);
  END IF;
END;
$$;
DO $$
BEGIN
  IF current_setting('miro.online_phase', true) IS DISTINCT FROM 'schema' THEN
    CREATE INDEX IF NOT EXISTS character_search_docs_short_idx ON miro_perf.character_search_docs
      USING gin (short_grams);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS miro_perf.character_play_users (
  character_id uuid NOT NULL,
  user_id uuid NOT NULL,
  active_sessions integer NOT NULL CHECK (active_sessions > 0),
  PRIMARY KEY (character_id, user_id)
);
CREATE TABLE IF NOT EXISTS miro_perf.character_play_counts (
  character_id uuid PRIMARY KEY,
  plays integer NOT NULL CHECK (plays > 0),
  created_at timestamptz NOT NULL
);
ALTER TABLE miro_perf.character_play_users DROP CONSTRAINT IF EXISTS character_play_users_character_fk;
ALTER TABLE miro_perf.character_play_users ADD CONSTRAINT character_play_users_character_fk
  FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;
ALTER TABLE miro_perf.character_play_counts DROP CONSTRAINT IF EXISTS character_play_counts_character_fk;
ALTER TABLE miro_perf.character_play_counts ADD CONSTRAINT character_play_counts_character_fk
  FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION miro_perf.change_character_play(character_key uuid, user_key uuid, delta integer)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  previous_count integer;
  total_plays integer;
BEGIN
  PERFORM pg_advisory_xact_lock(738225, hashtext(character_key::text));
  IF NOT EXISTS (SELECT 1 FROM public.characters WHERE id = character_key) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM miro_perf.character_backfill_state WHERE character_id = character_key) THEN
    RETURN;
  END IF;
  IF delta = 1 THEN
    INSERT INTO miro_perf.character_play_users (character_id, user_id, active_sessions)
    VALUES (character_key, user_key, 1)
    ON CONFLICT (character_id, user_id) DO UPDATE
      SET active_sessions = miro_perf.character_play_users.active_sessions + 1
    RETURNING active_sessions INTO previous_count;
    IF previous_count = 1 THEN
      INSERT INTO miro_perf.character_play_counts (character_id, plays, created_at)
      SELECT id, 1, created_at FROM public.characters WHERE id = character_key
      ON CONFLICT (character_id) DO UPDATE
        SET plays = miro_perf.character_play_counts.plays + 1;
    END IF;
  ELSE
    SELECT active_sessions INTO previous_count FROM miro_perf.character_play_users
    WHERE character_id = character_key AND user_id = user_key
    FOR UPDATE;
    IF previous_count IS NULL THEN
      RAISE EXCEPTION 'missing play pair for character %, user %', character_key, user_key;
    END IF;
    IF previous_count = 1 THEN
      DELETE FROM miro_perf.character_play_users WHERE character_id = character_key AND user_id = user_key;
      SELECT plays INTO total_plays FROM miro_perf.character_play_counts
      WHERE character_id = character_key FOR UPDATE;
      IF total_plays = 1 THEN
        DELETE FROM miro_perf.character_play_counts WHERE character_id = character_key;
      ELSE
        UPDATE miro_perf.character_play_counts SET plays = plays - 1 WHERE character_id = character_key;
      END IF;
    ELSE
      UPDATE miro_perf.character_play_users SET active_sessions = active_sessions - 1
      WHERE character_id = character_key AND user_id = user_key;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION miro_perf.roleplay_session_play_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.deleted_at IS NULL THEN
    PERFORM miro_perf.change_character_play(OLD.character_id, OLD.user_id, -1);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.deleted_at IS NULL THEN
    PERFORM miro_perf.change_character_play(NEW.character_id, NEW.user_id, 1);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS roleplay_session_play_changed ON public.roleplay_sessions;
CREATE TRIGGER roleplay_session_play_changed
AFTER INSERT OR UPDATE OF character_id, user_id, deleted_at OR DELETE ON public.roleplay_sessions
FOR EACH ROW EXECUTE FUNCTION miro_perf.roleplay_session_play_changed();

CREATE OR REPLACE FUNCTION miro_perf.cleanup_character_play()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.characters WHERE id = OLD.id) THEN
    RETURN OLD;
  END IF;
  DELETE FROM miro_perf.character_play_users WHERE character_id = OLD.id;
  DELETE FROM miro_perf.character_play_counts WHERE character_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS cleanup_character_play ON public.characters;
CREATE CONSTRAINT TRIGGER cleanup_character_play AFTER DELETE ON public.characters
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION miro_perf.cleanup_character_play();

CREATE OR REPLACE FUNCTION miro_perf.refresh_character_play_order()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(738225, hashtext(NEW.id::text));
  UPDATE miro_perf.character_play_counts SET created_at = NEW.created_at
  WHERE character_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS refresh_character_play_order ON public.characters;
CREATE TRIGGER refresh_character_play_order AFTER UPDATE OF created_at ON public.characters
FOR EACH ROW EXECUTE FUNCTION miro_perf.refresh_character_play_order();

CREATE OR REPLACE FUNCTION miro_perf.backfill_character(character_key uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(738224, hashtext(character_key::text));
  PERFORM pg_advisory_xact_lock(738225, hashtext(character_key::text));
  PERFORM miro_perf.refresh_character_search(character_key);
  DELETE FROM miro_perf.character_play_users WHERE character_id = character_key;
  DELETE FROM miro_perf.character_play_counts WHERE character_id = character_key;
  INSERT INTO miro_perf.character_play_users (character_id, user_id, active_sessions)
  SELECT character_id, user_id, count(*)::integer FROM public.roleplay_sessions
  WHERE character_id = character_key AND deleted_at IS NULL
  GROUP BY character_id, user_id;
  INSERT INTO miro_perf.character_play_counts (character_id, plays, created_at)
  SELECT c.id, count(*)::integer, c.created_at
  FROM public.characters c JOIN miro_perf.character_play_users users_for_character
    ON users_for_character.character_id = c.id
  WHERE c.id = character_key
  GROUP BY c.id, c.created_at;
  INSERT INTO miro_perf.character_backfill_state (character_id)
  SELECT id FROM public.characters WHERE id = character_key
  ON CONFLICT (character_id) DO NOTHING;
END;
$$;

DO $$
BEGIN
  IF current_setting('miro.online_phase', true) IS DISTINCT FROM 'schema' THEN
    TRUNCATE miro_perf.character_play_users, miro_perf.character_play_counts;
    INSERT INTO miro_perf.character_play_users (character_id, user_id, active_sessions)
    SELECT character_id, user_id, count(*)::integer FROM public.roleplay_sessions
    WHERE deleted_at IS NULL GROUP BY character_id, user_id;
    INSERT INTO miro_perf.character_play_counts (character_id, plays, created_at)
    SELECT u.character_id, count(*)::integer, c.created_at
    FROM miro_perf.character_play_users u JOIN public.characters c ON c.id = u.character_id
    GROUP BY u.character_id, c.created_at;
    INSERT INTO miro_perf.character_backfill_state (character_id)
    SELECT id FROM public.characters ON CONFLICT (character_id) DO NOTHING;
    CREATE INDEX IF NOT EXISTS character_play_counts_rank_idx ON miro_perf.character_play_counts
      (plays DESC, created_at DESC, character_id DESC);
  END IF;
END;
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA miro_perf FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA miro_perf FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    GRANT USAGE ON SCHEMA miro_perf TO postgres;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA miro_perf TO postgres;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA miro_perf TO postgres;
  END IF;
END;
$$;
