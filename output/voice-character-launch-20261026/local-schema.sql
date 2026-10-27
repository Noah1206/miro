--
-- PostgreSQL database dump
--

-- Dumped from database version 14.16 (Homebrew)
-- Dumped by pg_dump version 14.16 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: miro_perf; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA miro_perf;


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: backfill_character(uuid); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.backfill_character(character_key uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: change_character_play(uuid, uuid, integer); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.change_character_play(character_key uuid, user_key uuid, delta integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: character_search_character_changed(); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.character_search_character_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO miro_perf.character_backfill_state (character_id) VALUES (NEW.id)
    ON CONFLICT (character_id) DO NOTHING;
  END IF;
  PERFORM miro_perf.refresh_character_search(NEW.id);
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: characters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    is_official boolean DEFAULT false NOT NULL,
    name text NOT NULL,
    age text,
    nationality text,
    occupation text,
    mbti text,
    personality text NOT NULL,
    "values" text,
    speech_style text,
    user_nickname text,
    hobbies jsonb DEFAULT '[]'::jsonb NOT NULL,
    dislikes jsonb DEFAULT '[]'::jsonb NOT NULL,
    jealousy integer DEFAULT 50 NOT NULL,
    initiative integer DEFAULT 50 NOT NULL,
    emotional_expression integer DEFAULT 50 NOT NULL,
    social_position text,
    starting_context text,
    is_draft boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    slug text,
    role text,
    relationship_keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
    accent_a text,
    accent_b text,
    initial_relationship jsonb DEFAULT '{}'::jsonb NOT NULL,
    starting_time text DEFAULT '저녁'::text NOT NULL,
    tagline text,
    sample_dialogue jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    experience_type text DEFAULT 'reality'::text NOT NULL,
    lore jsonb DEFAULT '[]'::jsonb NOT NULL,
    voice_id text,
    relationship_profile jsonb,
    secret text,
    commands jsonb DEFAULT '[]'::jsonb NOT NULL,
    audience text DEFAULT 'female'::text NOT NULL,
    CONSTRAINT characters_audience_check CHECK ((audience = ANY (ARRAY['female'::text, 'male'::text]))),
    CONSTRAINT characters_experience_type_check CHECK ((experience_type = ANY (ARRAY['chat'::text, 'reality'::text])))
);


--
-- Name: character_search_text(public.characters, text); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.character_search_text(character_row public.characters, world_genre text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT lower(regexp_replace(concat_ws(' ', character_row.name, character_row.tagline,
    character_row.occupation, character_row.role, world_genre,
    array_to_string(ARRAY(SELECT jsonb_array_elements_text(character_row.relationship_keywords)), ' ')),
    '[[:space:]]+', '', 'g'));
$$;


--
-- Name: character_search_world_changed(); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.character_search_world_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: cleanup_character_play(); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.cleanup_character_play() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.characters WHERE id = OLD.id) THEN
    RETURN OLD;
  END IF;
  DELETE FROM miro_perf.character_play_users WHERE character_id = OLD.id;
  DELETE FROM miro_perf.character_play_counts WHERE character_id = OLD.id;
  RETURN OLD;
END;
$$;


--
-- Name: refresh_character_play_order(); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.refresh_character_play_order() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(738225, hashtext(NEW.id::text));
  UPDATE miro_perf.character_play_counts SET created_at = NEW.created_at
  WHERE character_id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: refresh_character_search(uuid); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.refresh_character_search(character_key uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: roleplay_session_play_changed(); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.roleplay_session_play_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: short_search_grams(text); Type: FUNCTION; Schema: miro_perf; Owner: -
--

CREATE FUNCTION miro_perf.short_search_grams(input_text text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT coalesce(array_agg(DISTINCT substr(input_text, position, span)), '{}'::text[])
  FROM generate_series(1, char_length(input_text)) position
  CROSS JOIN generate_series(1, 2) span
  WHERE position + span - 1 <= char_length(input_text);
$$;


--
-- Name: character_backfill_state; Type: TABLE; Schema: miro_perf; Owner: -
--

CREATE TABLE miro_perf.character_backfill_state (
    character_id uuid NOT NULL
);


--
-- Name: character_play_counts; Type: TABLE; Schema: miro_perf; Owner: -
--

CREATE TABLE miro_perf.character_play_counts (
    character_id uuid NOT NULL,
    plays integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT character_play_counts_plays_check CHECK ((plays > 0))
);


--
-- Name: character_play_users; Type: TABLE; Schema: miro_perf; Owner: -
--

CREATE TABLE miro_perf.character_play_users (
    character_id uuid NOT NULL,
    user_id uuid NOT NULL,
    active_sessions integer NOT NULL,
    CONSTRAINT character_play_users_active_sessions_check CHECK ((active_sessions > 0))
);


--
-- Name: character_search_docs; Type: TABLE; Schema: miro_perf; Owner: -
--

CREATE TABLE miro_perf.character_search_docs (
    character_id uuid NOT NULL,
    world_id uuid,
    search_text text NOT NULL,
    short_grams text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: account_deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    impact jsonb DEFAULT '{}'::jsonb NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    report_id uuid,
    action text NOT NULL,
    previous_status text,
    new_status text,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    bank_order_id uuid,
    character_id uuid
);


--
-- Name: admin_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_at timestamp with time zone
);


--
-- Name: ai_budget_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_budget_counters (
    key text NOT NULL,
    requests integer DEFAULT 0 NOT NULL,
    cost numeric(16,8) DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT ai_budget_counters_cost_check CHECK ((cost >= (0)::numeric)),
    CONSTRAINT ai_budget_counters_requests_check CHECK ((requests >= 0))
);


--
-- Name: ai_evaluation_samples; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_evaluation_samples (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    consent_version text NOT NULL,
    content jsonb NOT NULL,
    review_status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    signal text NOT NULL,
    consent_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_provider_leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_provider_leases (
    token uuid NOT NULL,
    provider text NOT NULL,
    workload text NOT NULL,
    lease_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_provider_leases_workload_check CHECK ((workload = ANY (ARRAY['interactive'::text, 'background'::text])))
);


--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage (
    id bigint NOT NULL,
    user_id uuid,
    session_id uuid,
    ip text,
    task text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    estimated_cost numeric(12,8),
    latency_ms integer NOT NULL,
    ok boolean NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_id uuid,
    trace_id uuid,
    request_id uuid,
    model_id text,
    model_version text,
    prompt_version text,
    usage_units integer DEFAULT 0 NOT NULL,
    actual_cost numeric(12,8),
    reserved_cost numeric(12,8) DEFAULT 0 NOT NULL,
    budget_keys jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    fallback_used boolean DEFAULT false NOT NULL,
    shadow boolean DEFAULT false NOT NULL,
    origin text,
    CONSTRAINT ai_usage_reserved_cost_check CHECK ((reserved_cost >= (0)::numeric)),
    CONSTRAINT ai_usage_usage_units_check CHECK ((usage_units >= 0))
);


--
-- Name: ai_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_usage_id_seq OWNED BY public.ai_usage.id;


--
-- Name: alpha_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alpha_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid
);


--
-- Name: analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event text NOT NULL,
    props jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: bank_telegram_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_telegram_requests (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    lease_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    message_id integer
);


--
-- Name: bank_transfer_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transfer_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    product_id text,
    amount_minor integer NOT NULL,
    currency text NOT NULL,
    units integer,
    depositor_name text NOT NULL,
    reference_code text NOT NULL,
    status text DEFAULT 'awaiting'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    settled_at timestamp with time zone,
    CONSTRAINT bank_transfer_orders_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT bank_transfer_orders_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT bank_transfer_orders_decided_check CHECK (((status = 'awaiting'::text) OR (status = 'expired'::text) OR ((decided_by IS NOT NULL) AND (decided_at IS NOT NULL)))),
    CONSTRAINT bank_transfer_orders_depositor_name_check CHECK (((length(btrim(depositor_name)) >= 1) AND (length(btrim(depositor_name)) <= 40))),
    CONSTRAINT bank_transfer_orders_kind_check CHECK ((kind = ANY (ARRAY['pass'::text, 'recharge'::text]))),
    CONSTRAINT bank_transfer_orders_kind_fields_check CHECK ((((kind = 'recharge'::text) AND (product_id IS NOT NULL) AND (units IS NOT NULL)) OR ((kind = 'pass'::text) AND (product_id IS NULL) AND (units IS NULL)))),
    CONSTRAINT bank_transfer_orders_status_check CHECK ((status = ANY (ARRAY['awaiting'::text, 'approved'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT bank_transfer_orders_units_check CHECK (((units IS NULL) OR (units > 0)))
);


--
-- Name: call_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    channel text NOT NULL,
    direction text NOT NULL,
    status text NOT NULL,
    reason text,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_sec integer,
    result text,
    usage_reservation_id uuid,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: character_bookmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_bookmarks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: character_comment_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_comment_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    comment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: character_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    hidden_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_id uuid
);


--
-- Name: character_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    trigger_key text NOT NULL,
    mode text NOT NULL,
    decision jsonb NOT NULL,
    provider_mode text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_decisions_mode_check CHECK ((mode = ANY (ARRAY['shadow'::text, 'live'::text])))
);


--
-- Name: character_life_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_life_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    occurred_at timestamp with time zone NOT NULL,
    block_label text NOT NULL,
    kind text NOT NULL,
    summary text NOT NULL,
    valence real NOT NULL,
    intensity real NOT NULL,
    shareable boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_life_events_block_label_check CHECK (((char_length(block_label) >= 1) AND (char_length(block_label) <= 40))),
    CONSTRAINT character_life_events_intensity_check CHECK (((intensity >= (0)::double precision) AND (intensity <= (1)::double precision))),
    CONSTRAINT character_life_events_kind_check CHECK ((kind = ANY (ARRAY['work'::text, 'errand'::text, 'social'::text, 'hobby'::text, 'rest'::text, 'incident'::text, 'thought'::text]))),
    CONSTRAINT character_life_events_summary_check CHECK (((char_length(summary) >= 1) AND (char_length(summary) <= 200))),
    CONSTRAINT character_life_events_valence_check CHECK (((valence >= ('-1'::integer)::double precision) AND (valence <= (1)::double precision)))
);


--
-- Name: character_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: character_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    source_hash text NOT NULL,
    authored jsonb NOT NULL,
    profile jsonb NOT NULL,
    compiled jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    compiler_version text DEFAULT 'agency-compiler:v1'::text NOT NULL,
    provider_mode text,
    attempts integer DEFAULT 0 NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT character_revisions_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT character_revisions_check CHECK (((status <> 'ready'::text) OR (compiled IS NOT NULL))),
    CONSTRAINT character_revisions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'compiling'::text, 'ready'::text, 'failed'::text])))
);


--
-- Name: character_runtime_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_runtime_states (
    session_id uuid NOT NULL,
    revision_id uuid NOT NULL,
    mode text NOT NULL,
    state jsonb NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    next_wake_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    life_until timestamp with time zone,
    CONSTRAINT character_runtime_states_mode_check CHECK ((mode = ANY (ARRAY['shadow'::text, 'live'::text]))),
    CONSTRAINT character_runtime_states_version_check CHECK ((version >= 0))
);


--
-- Name: character_visual_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.character_visual_identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    base_face jsonb DEFAULT '{}'::jsonb NOT NULL,
    body_profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    hair jsonb DEFAULT '{}'::jsonb NOT NULL,
    style_tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    expression_tendency text,
    outfit_profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    reference_source text DEFAULT 'text'::text NOT NULL,
    has_real_person_reference boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: command_book; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.command_book (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    name text NOT NULL,
    hint text DEFAULT ''::text NOT NULL,
    prompt text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    uses integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: contact_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    contact_frequency integer DEFAULT 50 NOT NULL,
    reply_delay_minutes integer DEFAULT 5 NOT NULL,
    preferred_channel text DEFAULT 'message'::text NOT NULL,
    call_probability integer DEFAULT 30 NOT NULL,
    video_call_probability integer DEFAULT 10 NOT NULL,
    photo_probability integer DEFAULT 20 NOT NULL,
    voice_message_probability integer DEFAULT 20 NOT NULL,
    active_hours_start text DEFAULT '08:00'::text NOT NULL,
    active_hours_end text DEFAULT '23:00'::text NOT NULL,
    initiative_level integer DEFAULT 50 NOT NULL,
    presentation jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    routine jsonb
);


--
-- Name: conversation_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_requests (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    input_hash text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    result jsonb,
    lease_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    participant_npc_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    continuation_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    consequences jsonb DEFAULT '[]'::jsonb NOT NULL,
    cooldown_until_turn integer DEFAULT 0 NOT NULL,
    created_at_turn integer NOT NULL,
    resolved_at_turn integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: generated_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generated_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    character_id uuid NOT NULL,
    kind text NOT NULL,
    url text NOT NULL,
    cache_key text NOT NULL,
    prompt text DEFAULT ''::text NOT NULL,
    visual_identity_id uuid,
    visual_identity_version integer,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: memories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    character_id uuid NOT NULL,
    type text NOT NULL,
    content text NOT NULL,
    importance integer NOT NULL,
    persistence integer NOT NULL,
    confidence integer NOT NULL,
    source_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: memory_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memory_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    character_id uuid NOT NULL,
    user_id uuid NOT NULL,
    request_id uuid,
    message_id uuid NOT NULL,
    through_turn integer NOT NULL,
    kind text NOT NULL,
    version text DEFAULT 'memory-job:v1'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone,
    lease_token uuid,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT memory_jobs_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT memory_jobs_kind_check CHECK ((kind = ANY (ARRAY['memory_extraction'::text, 'memory_summary'::text]))),
    CONSTRAINT memory_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text, 'cancelled'::text, 'superseded'::text]))),
    CONSTRAINT memory_jobs_through_turn_check CHECK ((through_turn >= 0))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    kind text DEFAULT 'text'::text NOT NULL,
    content text NOT NULL,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    media_id uuid,
    turn_index integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    hidden_at timestamp with time zone
);


--
-- Name: messenger_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messenger_inbox (
    message_id uuid NOT NULL,
    session_id uuid NOT NULL,
    status text DEFAULT 'unread'::text NOT NULL,
    read_at timestamp with time zone,
    next_review_at timestamp with time zone NOT NULL,
    lease_until timestamp with time zone,
    lease_token uuid,
    contact_id uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attention_state text DEFAULT 'pending'::text NOT NULL,
    attention_context_key text,
    attention_decision jsonb,
    CONSTRAINT messenger_inbox_attention_state_check CHECK ((attention_state = ANY (ARRAY['pending'::text, 'deferred'::text, 'left'::text]))),
    CONSTRAINT messenger_inbox_check CHECK ((((status = 'unread'::text) AND (read_at IS NULL)) OR ((status <> 'unread'::text) AND (read_at IS NOT NULL)))),
    CONSTRAINT messenger_inbox_status_check CHECK ((status = ANY (ARRAY['unread'::text, 'read'::text, 'replied'::text, 'left'::text])))
);


--
-- Name: npcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.npcs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    knows jsonb DEFAULT '[]'::jsonb NOT NULL,
    relationship_to_character text DEFAULT ''::text NOT NULL,
    relationship_to_user text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: official_voices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.official_voices (
    id text NOT NULL,
    label text NOT NULL,
    provider text NOT NULL,
    provider_voice_id text NOT NULL,
    status text NOT NULL,
    samples jsonb NOT NULL,
    rights jsonb NOT NULL,
    approval jsonb NOT NULL,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    retired_at timestamp with time zone,
    CONSTRAINT official_voices_check CHECK (((status = 'retired'::text) = (retired_at IS NOT NULL))),
    CONSTRAINT official_voices_id_check CHECK ((id ~ '^[a-z0-9][a-z0-9-]{1,39}$'::text)),
    CONSTRAINT official_voices_label_check CHECK (((length(label) >= 1) AND (length(label) <= 30))),
    CONSTRAINT official_voices_provider_check CHECK ((provider = ANY (ARRAY['chatterbox'::text, 'gpt-sovits'::text]))),
    CONSTRAINT official_voices_provider_voice_id_check CHECK ((provider_voice_id ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT official_voices_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);


--
-- Name: ops_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_alerts (
    key text NOT NULL,
    last_sent_at timestamp with time zone NOT NULL,
    detail text
);


--
-- Name: ops_backup_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_backup_runs (
    id bigint NOT NULL,
    finished_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot_at timestamp with time zone NOT NULL,
    db_tables integer NOT NULL,
    db_rows integer NOT NULL,
    db_bytes integer NOT NULL,
    files integer NOT NULL,
    file_bytes bigint NOT NULL
);


--
-- Name: ops_backup_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ops_backup_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ops_backup_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ops_backup_runs_id_seq OWNED BY public.ops_backup_runs.id;


--
-- Name: ops_cron_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_cron_config (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ops_heartbeats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_heartbeats (
    name text NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    provider text NOT NULL,
    external_event_id text NOT NULL,
    external_ref text NOT NULL,
    type text NOT NULL,
    period_end timestamp with time zone,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    failed_at timestamp with time zone
);


--
-- Name: reality_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reality_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    channel text NOT NULL,
    dedupe_key text NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text NOT NULL,
    suppressed_reason text,
    message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    opened_at timestamp with time zone
);


--
-- Name: reality_push_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reality_push_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone,
    lease_token uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reality_push_jobs_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT reality_push_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: recharge_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recharge_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount integer NOT NULL,
    consumed integer DEFAULT 0 NOT NULL,
    refunded integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    source text NOT NULL,
    provider text,
    external_ref text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recharge_grants_amount_check CHECK ((amount > 0)),
    CONSTRAINT recharge_grants_consumed_check CHECK ((consumed >= 0)),
    CONSTRAINT recharge_grants_refunded_check CHECK ((refunded >= 0)),
    CONSTRAINT recharge_grants_source_check CHECK ((source = ANY (ARRAY['purchase'::text, 'grant'::text, 'refund_reversal'::text]))),
    CONSTRAINT recharge_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text]))),
    CONSTRAINT recharge_grants_within_amount CHECK (((consumed + refunded) <= amount))
);


--
-- Name: recharge_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recharge_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ledger_id uuid NOT NULL,
    grant_id uuid NOT NULL,
    amount integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recharge_ledger_amount_check CHECK ((amount > 0))
);


--
-- Name: relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    trust integer DEFAULT 30 NOT NULL,
    attraction integer DEFAULT 10 NOT NULL,
    jealousy integer DEFAULT 0 NOT NULL,
    protectiveness integer DEFAULT 20 NOT NULL,
    emotional_distance integer DEFAULT 60 NOT NULL,
    attachment integer DEFAULT 10 NOT NULL,
    stage text DEFAULT 'stranger'::text NOT NULL,
    unresolved_event_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    reason text NOT NULL,
    detail text DEFAULT ''::text NOT NULL,
    character_id uuid,
    session_id uuid,
    target_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    resolution text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: roleplay_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roleplay_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    character_id uuid NOT NULL,
    world_id uuid NOT NULL,
    output_style text DEFAULT 'balanced'::text NOT NULL,
    turn_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_interaction_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    pending_reality_intent jsonb,
    reality_checked_at timestamp with time zone,
    character_status text,
    restricted_at timestamp with time zone,
    restricted_reason text,
    character_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    policy_version text DEFAULT 'legacy:v1'::text NOT NULL,
    adult_mode boolean DEFAULT false NOT NULL,
    adult_since timestamp with time zone,
    adult_level text DEFAULT 'explicit'::text NOT NULL,
    opening_scene text,
    character_status_at timestamp with time zone,
    contact_boundary jsonb,
    user_persona jsonb,
    CONSTRAINT roleplay_sessions_adult_level_check CHECK ((adult_level = ANY (ARRAY['soft'::text, 'deep'::text, 'explicit'::text])))
);


--
-- Name: scenes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    location text NOT NULL,
    "time" text NOT NULL,
    mood text DEFAULT ''::text NOT NULL,
    weather text DEFAULT ''::text NOT NULL,
    scene_key text NOT NULL,
    background_asset_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: speech_credit_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speech_credit_allocations (
    job_id uuid NOT NULL,
    grant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seconds integer NOT NULL,
    charged integer DEFAULT 0 NOT NULL,
    state text DEFAULT 'reserved'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT speech_credit_allocations_check CHECK (((charged >= 0) AND (charged <= seconds))),
    CONSTRAINT speech_credit_allocations_seconds_check CHECK ((seconds > 0)),
    CONSTRAINT speech_credit_allocations_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'committed'::text, 'refunded'::text])))
);


--
-- Name: speech_credit_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speech_credit_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    reference text NOT NULL,
    seconds integer NOT NULL,
    consumed integer DEFAULT 0 NOT NULL,
    reserved integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT speech_credit_grants_check CHECK (((consumed + reserved) <= seconds)),
    CONSTRAINT speech_credit_grants_consumed_check CHECK ((consumed >= 0)),
    CONSTRAINT speech_credit_grants_kind_check CHECK ((kind = ANY (ARRAY['trial'::text, 'purchase'::text]))),
    CONSTRAINT speech_credit_grants_reserved_check CHECK ((reserved >= 0)),
    CONSTRAINT speech_credit_grants_seconds_check CHECK (((seconds > 0) AND (seconds <= 3600)))
);


--
-- Name: speech_synthesis_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speech_synthesis_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid NOT NULL,
    message_id uuid NOT NULL,
    cache_key text NOT NULL,
    part integer NOT NULL,
    model_version text NOT NULL,
    reference_version text NOT NULL,
    payload jsonb NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    reservation_micro_usd bigint NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    audio bytea,
    content_type text,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT speech_synthesis_jobs_audio_check CHECK ((octet_length(audio) <= 4194304)),
    CONSTRAINT speech_synthesis_jobs_part_check CHECK (((part >= '-1'::integer) AND (part <= 11))),
    CONSTRAINT speech_synthesis_jobs_reservation_micro_usd_check CHECK ((reservation_micro_usd > 0)),
    CONSTRAINT speech_synthesis_jobs_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'failed'::text, 'uncertain'::text])))
);


--
-- Name: speech_synthesis_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speech_synthesis_usage (
    job_id uuid NOT NULL,
    user_key text NOT NULL,
    reservation_micro_usd bigint NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT speech_synthesis_usage_reservation_micro_usd_check CHECK ((reservation_micro_usd > 0)),
    CONSTRAINT speech_synthesis_usage_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'uncertain'::text, 'finished'::text])))
);


--
-- Name: state_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.state_transitions (
    id bigint NOT NULL,
    session_id uuid NOT NULL,
    trigger_key text NOT NULL,
    seq integer NOT NULL,
    policy_version text NOT NULL,
    engine text NOT NULL,
    revision_id uuid,
    decision_id text,
    cause_message_id uuid,
    actor text NOT NULL,
    target text,
    field text NOT NULL,
    before jsonb,
    after jsonb,
    rule text NOT NULL,
    status text NOT NULL,
    clock text NOT NULL,
    world_version integer,
    relationship_version integer,
    runtime_version integer,
    outcome_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT state_transitions_clock_check CHECK ((clock = ANY (ARRAY['real'::text, 'narrative'::text]))),
    CONSTRAINT state_transitions_engine_check CHECK ((engine = ANY (ARRAY['legacy'::text, 'agency'::text]))),
    CONSTRAINT state_transitions_seq_check CHECK ((seq >= 0)),
    CONSTRAINT state_transitions_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'rejected'::text, 'held'::text])))
);


--
-- Name: state_transitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.state_transitions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: state_transitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.state_transitions_id_seq OWNED BY public.state_transitions.id;


--
-- Name: stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    audience text NOT NULL,
    title text NOT NULL,
    public jsonb NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    seeded_hash text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stories_audience_check CHECK ((audience = ANY (ARRAY['reverse_harem'::text, 'bl'::text])))
);


--
-- Name: story_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_changes (
    id bigint NOT NULL,
    run_id uuid NOT NULL,
    turn_id uuid,
    message_id uuid,
    kind text NOT NULL,
    detail jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.story_changes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: story_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.story_changes_id_seq OWNED BY public.story_changes.id;


--
-- Name: story_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    rule_id text NOT NULL,
    key text NOT NULL,
    speaker text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    due_at timestamp with time zone NOT NULL,
    scheduled_scene integer NOT NULL,
    cause_turn_id uuid,
    reason text,
    message_id uuid,
    lease_until timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_contacts_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'cancelled'::text])))
);


--
-- Name: story_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    turn_id uuid,
    channel text NOT NULL,
    thread text,
    role text NOT NULL,
    speaker text,
    content text NOT NULL,
    blocks jsonb,
    contact_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_messages_channel_check CHECK ((channel = ANY (ARRAY['scene'::text, 'dm'::text]))),
    CONSTRAINT story_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'scene'::text, 'character'::text, 'system'::text])))
);


--
-- Name: story_private; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_private (
    story_id uuid NOT NULL,
    definition jsonb NOT NULL,
    seeded_hash text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: story_push_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_push_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    subscription_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_until timestamp with time zone,
    lease_token uuid,
    error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT story_push_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'cancelled'::text, 'failed'::text])))
);


--
-- Name: story_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    story_id uuid NOT NULL,
    run_no integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    definition_version integer NOT NULL,
    protagonist jsonb NOT NULL,
    state jsonb NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    last_scene_input_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    adult_since timestamp with time zone,
    CONSTRAINT story_runs_status_check CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text, 'archived'::text])))
);


--
-- Name: story_turns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.story_turns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    client_turn_id text NOT NULL,
    channel text NOT NULL,
    thread text,
    input_hash text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    base_version integer NOT NULL,
    result jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT story_turns_channel_check CHECK ((channel = ANY (ARRAY['scene'::text, 'dm'::text]))),
    CONSTRAINT story_turns_status_check CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan text DEFAULT 'pro'::text NOT NULL,
    status text NOT NULL,
    renewal_status text DEFAULT 'auto'::text NOT NULL,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    external_ref text,
    provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expiry_notice text,
    CONSTRAINT subscriptions_expiry_notice_check CHECK (((expiry_notice IS NULL) OR (expiry_notice = ANY (ARRAY['soon'::text, 'ended'::text]))))
);


--
-- Name: terms_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.terms_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    terms_version text NOT NULL,
    privacy_version text NOT NULL,
    agreed_at timestamp with time zone DEFAULT now() NOT NULL,
    transfer_version text
);


--
-- Name: usage_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    window_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    units integer DEFAULT 1 NOT NULL,
    amount integer NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'reserved'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    continuity boolean DEFAULT false NOT NULL,
    from_grants integer DEFAULT 0 NOT NULL
);


--
-- Name: usage_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    consumed integer DEFAULT 0 NOT NULL,
    "limit" integer NOT NULL,
    period text DEFAULT 'monthly'::text NOT NULL,
    policy_version text DEFAULT 'monthly-v1-dev'::text NOT NULL,
    continuity_consumed integer DEFAULT 0 NOT NULL,
    CONSTRAINT usage_windows_continuity_consumed_check CHECK ((continuity_consumed >= 0))
);


--
-- Name: user_moments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_moments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    source_message_id uuid,
    about text NOT NULL,
    event_at timestamp with time zone NOT NULL,
    has_time boolean DEFAULT false NOT NULL,
    cheer_at timestamp with time zone,
    ask_at timestamp with time zone NOT NULL,
    cheered_at timestamp with time zone,
    asked_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_moments_about_check CHECK (((char_length(about) >= 1) AND (char_length(about) <= 60))),
    CONSTRAINT user_moments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text])))
);


--
-- Name: user_personas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_personas (
    user_id uuid NOT NULL,
    name text NOT NULL,
    gender text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_personas_description_check CHECK (((description IS NULL) OR (char_length(description) <= 300))),
    CONSTRAINT user_personas_gender_check CHECK ((gender = ANY (ARRAY['female'::text, 'male'::text]))),
    CONSTRAINT user_personas_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 12)))
);


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    user_id uuid NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    voice_call_enabled boolean DEFAULT true NOT NULL,
    video_call_enabled boolean DEFAULT true NOT NULL,
    quiet_hours_enabled boolean DEFAULT true NOT NULL,
    quiet_hours_start text DEFAULT '23:00'::text NOT NULL,
    quiet_hours_end text DEFAULT '08:00'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    time_zone text DEFAULT 'Asia/Seoul'::text NOT NULL,
    camera_consent_at timestamp with time zone,
    mic_consent_at timestamp with time zone,
    image_upload_consent_at timestamp with time zone,
    marketing_consent_at timestamp with time zone,
    night_marketing_consent_at timestamp with time zone,
    language text DEFAULT 'ko'::text NOT NULL,
    unveil_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT user_settings_language_known CHECK ((language = ANY (ARRAY['ko'::text, 'en'::text, 'ja'::text, 'zh'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    display_name text,
    plan text DEFAULT 'free'::text NOT NULL,
    adult_verified_at timestamp with time zone,
    adult_verify_failed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    mature_policy_agreed_at timestamp with time zone,
    is_guest boolean DEFAULT false NOT NULL,
    allow_training boolean DEFAULT false NOT NULL,
    allow_evaluation boolean DEFAULT false NOT NULL,
    ai_consent_version text,
    ai_consent_at timestamp with time zone,
    birth_date date,
    tastes text[] DEFAULT '{}'::text[] NOT NULL,
    avatar_url text,
    adult_verify_di text,
    CONSTRAINT users_tastes_known CHECK ((tastes <@ ARRAY['bl'::text, 'hl'::text, 'gl'::text]))
);


--
-- Name: voice_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    voice_id text NOT NULL,
    label text NOT NULL,
    source_urls jsonb NOT NULL,
    rights jsonb DEFAULT '{"basis": "unverified", "holder": "", "evidence": ""}'::jsonb NOT NULL,
    requested_by text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    stage text DEFAULT ''::text NOT NULL,
    log text DEFAULT ''::text NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    CONSTRAINT voice_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: world_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.world_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    current_location text NOT NULL,
    "current_time" text NOT NULL,
    current_scene_id uuid,
    world_status text,
    active_event_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    active_npc_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    unresolved_world_events jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    narrative_calendar jsonb
);


--
-- Name: worlds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worlds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    character_id uuid NOT NULL,
    era text,
    location text,
    genre text,
    world_setting text
);


--
-- Name: ai_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage ALTER COLUMN id SET DEFAULT nextval('public.ai_usage_id_seq'::regclass);


--
-- Name: ops_backup_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_backup_runs ALTER COLUMN id SET DEFAULT nextval('public.ops_backup_runs_id_seq'::regclass);


--
-- Name: state_transitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.state_transitions ALTER COLUMN id SET DEFAULT nextval('public.state_transitions_id_seq'::regclass);


--
-- Name: story_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_changes ALTER COLUMN id SET DEFAULT nextval('public.story_changes_id_seq'::regclass);


--
-- Name: character_backfill_state character_backfill_state_pkey; Type: CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_backfill_state
    ADD CONSTRAINT character_backfill_state_pkey PRIMARY KEY (character_id);


--
-- Name: character_play_counts character_play_counts_pkey; Type: CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_play_counts
    ADD CONSTRAINT character_play_counts_pkey PRIMARY KEY (character_id);


--
-- Name: character_play_users character_play_users_pkey; Type: CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_play_users
    ADD CONSTRAINT character_play_users_pkey PRIMARY KEY (character_id, user_id);


--
-- Name: account_deletions account_deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletions
    ADD CONSTRAINT account_deletions_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: admin_actions admin_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_pkey PRIMARY KEY (id);


--
-- Name: admin_sessions admin_sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_token_unique UNIQUE (token);


--
-- Name: admin_users admin_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_email_unique UNIQUE (email);


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_users
    ADD CONSTRAINT admin_users_pkey PRIMARY KEY (id);


--
-- Name: ai_budget_counters ai_budget_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_budget_counters
    ADD CONSTRAINT ai_budget_counters_pkey PRIMARY KEY (key);


--
-- Name: ai_evaluation_samples ai_evaluation_samples_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_evaluation_samples
    ADD CONSTRAINT ai_evaluation_samples_pkey PRIMARY KEY (id);


--
-- Name: ai_feedback ai_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedback
    ADD CONSTRAINT ai_feedback_pkey PRIMARY KEY (id);


--
-- Name: ai_provider_leases ai_provider_leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_provider_leases
    ADD CONSTRAINT ai_provider_leases_pkey PRIMARY KEY (token);


--
-- Name: ai_usage ai_usage_attempt_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_attempt_id_key UNIQUE (attempt_id);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: alpha_waitlist alpha_waitlist_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alpha_waitlist
    ADD CONSTRAINT alpha_waitlist_email_key UNIQUE (email);


--
-- Name: alpha_waitlist alpha_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alpha_waitlist
    ADD CONSTRAINT alpha_waitlist_pkey PRIMARY KEY (id);


--
-- Name: analytics_events analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_pkey PRIMARY KEY (id);


--
-- Name: auth_sessions auth_sessions_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_token_unique UNIQUE (token);


--
-- Name: bank_telegram_requests bank_telegram_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_telegram_requests
    ADD CONSTRAINT bank_telegram_requests_pkey PRIMARY KEY (id);


--
-- Name: bank_transfer_orders bank_transfer_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_orders
    ADD CONSTRAINT bank_transfer_orders_pkey PRIMARY KEY (id);


--
-- Name: bank_transfer_orders bank_transfer_orders_reference_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_orders
    ADD CONSTRAINT bank_transfer_orders_reference_code_key UNIQUE (reference_code);


--
-- Name: call_sessions call_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_pkey PRIMARY KEY (id);


--
-- Name: character_bookmarks character_bookmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_bookmarks
    ADD CONSTRAINT character_bookmarks_pkey PRIMARY KEY (id);


--
-- Name: character_comment_likes character_comment_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_comment_likes
    ADD CONSTRAINT character_comment_likes_pkey PRIMARY KEY (id);


--
-- Name: character_comments character_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_comments
    ADD CONSTRAINT character_comments_pkey PRIMARY KEY (id);


--
-- Name: character_decisions character_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_decisions
    ADD CONSTRAINT character_decisions_pkey PRIMARY KEY (id);


--
-- Name: character_life_events character_life_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_life_events
    ADD CONSTRAINT character_life_events_pkey PRIMARY KEY (id);


--
-- Name: character_likes character_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_likes
    ADD CONSTRAINT character_likes_pkey PRIMARY KEY (id);


--
-- Name: character_revisions character_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_revisions
    ADD CONSTRAINT character_revisions_pkey PRIMARY KEY (id);


--
-- Name: character_runtime_states character_runtime_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_runtime_states
    ADD CONSTRAINT character_runtime_states_pkey PRIMARY KEY (session_id);


--
-- Name: character_visual_identities character_visual_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_visual_identities
    ADD CONSTRAINT character_visual_identities_pkey PRIMARY KEY (id);


--
-- Name: characters characters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_pkey PRIMARY KEY (id);


--
-- Name: characters characters_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_slug_unique UNIQUE (slug);


--
-- Name: command_book command_book_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.command_book
    ADD CONSTRAINT command_book_pkey PRIMARY KEY (id);


--
-- Name: contact_profiles contact_profiles_character_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_profiles
    ADD CONSTRAINT contact_profiles_character_id_unique UNIQUE (character_id);


--
-- Name: contact_profiles contact_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_profiles
    ADD CONSTRAINT contact_profiles_pkey PRIMARY KEY (id);


--
-- Name: conversation_requests conversation_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_requests
    ADD CONSTRAINT conversation_requests_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: generated_media generated_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_media
    ADD CONSTRAINT generated_media_pkey PRIMARY KEY (id);


--
-- Name: memories memories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_pkey PRIMARY KEY (id);


--
-- Name: memory_jobs memory_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_jobs
    ADD CONSTRAINT memory_jobs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: messenger_inbox messenger_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messenger_inbox
    ADD CONSTRAINT messenger_inbox_pkey PRIMARY KEY (message_id);


--
-- Name: npcs npcs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npcs
    ADD CONSTRAINT npcs_pkey PRIMARY KEY (id);


--
-- Name: official_voices official_voices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.official_voices
    ADD CONSTRAINT official_voices_pkey PRIMARY KEY (id);


--
-- Name: official_voices official_voices_provider_voice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.official_voices
    ADD CONSTRAINT official_voices_provider_voice_id_key UNIQUE (provider_voice_id);


--
-- Name: ops_alerts ops_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_alerts
    ADD CONSTRAINT ops_alerts_pkey PRIMARY KEY (key);


--
-- Name: ops_backup_runs ops_backup_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_backup_runs
    ADD CONSTRAINT ops_backup_runs_pkey PRIMARY KEY (id);


--
-- Name: ops_cron_config ops_cron_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_cron_config
    ADD CONSTRAINT ops_cron_config_pkey PRIMARY KEY (key);


--
-- Name: ops_heartbeats ops_heartbeats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_heartbeats
    ADD CONSTRAINT ops_heartbeats_pkey PRIMARY KEY (name);


--
-- Name: payment_events payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: reality_contacts reality_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_contacts
    ADD CONSTRAINT reality_contacts_pkey PRIMARY KEY (id);


--
-- Name: reality_push_jobs reality_push_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_push_jobs
    ADD CONSTRAINT reality_push_jobs_pkey PRIMARY KEY (id);


--
-- Name: recharge_grants recharge_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_grants
    ADD CONSTRAINT recharge_grants_pkey PRIMARY KEY (id);


--
-- Name: recharge_ledger recharge_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_ledger
    ADD CONSTRAINT recharge_ledger_pkey PRIMARY KEY (id);


--
-- Name: relationships relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_pkey PRIMARY KEY (id);


--
-- Name: relationships relationships_session_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_session_id_unique UNIQUE (session_id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: roleplay_sessions roleplay_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roleplay_sessions
    ADD CONSTRAINT roleplay_sessions_pkey PRIMARY KEY (id);


--
-- Name: scenes scenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenes
    ADD CONSTRAINT scenes_pkey PRIMARY KEY (id);


--
-- Name: speech_credit_allocations speech_credit_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_credit_allocations
    ADD CONSTRAINT speech_credit_allocations_pkey PRIMARY KEY (job_id, grant_id);


--
-- Name: speech_credit_grants speech_credit_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_credit_grants
    ADD CONSTRAINT speech_credit_grants_pkey PRIMARY KEY (id);


--
-- Name: speech_credit_grants speech_credit_grants_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_credit_grants
    ADD CONSTRAINT speech_credit_grants_reference_key UNIQUE (reference);


--
-- Name: speech_synthesis_jobs speech_synthesis_jobs_cache_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_synthesis_jobs
    ADD CONSTRAINT speech_synthesis_jobs_cache_key_key UNIQUE (cache_key);


--
-- Name: speech_synthesis_jobs speech_synthesis_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_synthesis_jobs
    ADD CONSTRAINT speech_synthesis_jobs_pkey PRIMARY KEY (id);


--
-- Name: speech_synthesis_usage speech_synthesis_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_synthesis_usage
    ADD CONSTRAINT speech_synthesis_usage_pkey PRIMARY KEY (job_id);


--
-- Name: state_transitions state_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.state_transitions
    ADD CONSTRAINT state_transitions_pkey PRIMARY KEY (id);


--
-- Name: stories stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_pkey PRIMARY KEY (id);


--
-- Name: stories stories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stories
    ADD CONSTRAINT stories_slug_key UNIQUE (slug);


--
-- Name: story_changes story_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_changes
    ADD CONSTRAINT story_changes_pkey PRIMARY KEY (id);


--
-- Name: story_contacts story_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_contacts
    ADD CONSTRAINT story_contacts_pkey PRIMARY KEY (id);


--
-- Name: story_messages story_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages
    ADD CONSTRAINT story_messages_pkey PRIMARY KEY (id);


--
-- Name: story_private story_private_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_private
    ADD CONSTRAINT story_private_pkey PRIMARY KEY (story_id);


--
-- Name: story_push_jobs story_push_jobs_contact_id_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_push_jobs
    ADD CONSTRAINT story_push_jobs_contact_id_subscription_id_key UNIQUE (contact_id, subscription_id);


--
-- Name: story_push_jobs story_push_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_push_jobs
    ADD CONSTRAINT story_push_jobs_pkey PRIMARY KEY (id);


--
-- Name: story_runs story_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_runs
    ADD CONSTRAINT story_runs_pkey PRIMARY KEY (id);


--
-- Name: story_turns story_turns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_turns
    ADD CONSTRAINT story_turns_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_external_ref_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_external_ref_unique UNIQUE (external_ref);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);


--
-- Name: terms_consents terms_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terms_consents
    ADD CONSTRAINT terms_consents_pkey PRIMARY KEY (id);


--
-- Name: usage_ledger usage_ledger_idempotency_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: usage_ledger usage_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_pkey PRIMARY KEY (id);


--
-- Name: usage_windows usage_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_windows
    ADD CONSTRAINT usage_windows_pkey PRIMARY KEY (id);


--
-- Name: user_moments user_moments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_moments
    ADD CONSTRAINT user_moments_pkey PRIMARY KEY (id);


--
-- Name: user_moments user_moments_session_id_about_event_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_moments
    ADD CONSTRAINT user_moments_session_id_about_event_at_key UNIQUE (session_id, about, event_at);


--
-- Name: user_personas user_personas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personas
    ADD CONSTRAINT user_personas_pkey PRIMARY KEY (user_id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: voice_jobs voice_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_jobs
    ADD CONSTRAINT voice_jobs_pkey PRIMARY KEY (id);


--
-- Name: voice_jobs voice_jobs_voice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_jobs
    ADD CONSTRAINT voice_jobs_voice_id_key UNIQUE (voice_id);


--
-- Name: world_states world_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.world_states
    ADD CONSTRAINT world_states_pkey PRIMARY KEY (id);


--
-- Name: world_states world_states_session_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.world_states
    ADD CONSTRAINT world_states_session_id_unique UNIQUE (session_id);


--
-- Name: worlds worlds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worlds
    ADD CONSTRAINT worlds_pkey PRIMARY KEY (id);


--
-- Name: character_play_counts_rank_idx; Type: INDEX; Schema: miro_perf; Owner: -
--

CREATE INDEX character_play_counts_rank_idx ON miro_perf.character_play_counts USING btree (plays DESC, created_at DESC, character_id DESC);


--
-- Name: character_search_docs_key_idx; Type: INDEX; Schema: miro_perf; Owner: -
--

CREATE UNIQUE INDEX character_search_docs_key_idx ON miro_perf.character_search_docs USING btree (character_id, COALESCE(world_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: character_search_docs_short_idx; Type: INDEX; Schema: miro_perf; Owner: -
--

CREATE INDEX character_search_docs_short_idx ON miro_perf.character_search_docs USING gin (short_grams);


--
-- Name: character_search_docs_trgm_idx; Type: INDEX; Schema: miro_perf; Owner: -
--

CREATE INDEX character_search_docs_trgm_idx ON miro_perf.character_search_docs USING gin (search_text extensions.gin_trgm_ops);


--
-- Name: accounts_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_provider_idx ON public.accounts USING btree (provider, provider_account_id);


--
-- Name: admin_actions_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_actions_report_idx ON public.admin_actions USING btree (report_id, created_at);


--
-- Name: ai_evaluation_samples_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_evaluation_samples_request_idx ON public.ai_evaluation_samples USING btree (request_id);


--
-- Name: ai_evaluation_samples_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_evaluation_samples_user_idx ON public.ai_evaluation_samples USING btree (user_id);


--
-- Name: ai_feedback_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_feedback_request_idx ON public.ai_feedback USING btree (request_id);


--
-- Name: ai_feedback_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_feedback_user_idx ON public.ai_feedback USING btree (user_id);


--
-- Name: ai_provider_leases_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_provider_leases_expiry_idx ON public.ai_provider_leases USING btree (lease_until);


--
-- Name: ai_usage_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_created_idx ON public.ai_usage USING btree (created_at);


--
-- Name: ai_usage_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_ip_idx ON public.ai_usage USING btree (ip, created_at);


--
-- Name: ai_usage_model_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_model_time_idx ON public.ai_usage USING btree (model_id, created_at);


--
-- Name: ai_usage_trace_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_trace_idx ON public.ai_usage USING btree (trace_id);


--
-- Name: ai_usage_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_user_idx ON public.ai_usage USING btree (user_id, created_at);


--
-- Name: analytics_event_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX analytics_event_time_idx ON public.analytics_events USING btree (event, created_at);


--
-- Name: auth_sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX auth_sessions_user_idx ON public.auth_sessions USING btree (user_id);


--
-- Name: bank_telegram_requests_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_telegram_requests_pending_idx ON public.bank_telegram_requests USING btree (sent_at, created_at);


--
-- Name: bank_transfer_orders_one_awaiting_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bank_transfer_orders_one_awaiting_idx ON public.bank_transfer_orders USING btree (user_id) WHERE (status = 'awaiting'::text);


--
-- Name: bank_transfer_orders_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transfer_orders_status_idx ON public.bank_transfer_orders USING btree (status, created_at);


--
-- Name: bank_transfer_orders_unsettled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transfer_orders_unsettled_idx ON public.bank_transfer_orders USING btree (decided_at) WHERE ((status = 'approved'::text) AND (settled_at IS NULL));


--
-- Name: bank_transfer_orders_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bank_transfer_orders_user_idx ON public.bank_transfer_orders USING btree (user_id, created_at DESC);


--
-- Name: call_sessions_one_ringing_per_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX call_sessions_one_ringing_per_session ON public.call_sessions USING btree (session_id) WHERE (status = 'ringing'::text);


--
-- Name: call_sessions_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_sessions_session_idx ON public.call_sessions USING btree (session_id, created_at);


--
-- Name: character_bookmarks_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX character_bookmarks_uniq ON public.character_bookmarks USING btree (user_id, character_id);


--
-- Name: character_bookmarks_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_bookmarks_user_idx ON public.character_bookmarks USING btree (user_id, created_at);


--
-- Name: character_comment_likes_comment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_comment_likes_comment_idx ON public.character_comment_likes USING btree (comment_id);


--
-- Name: character_comment_likes_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX character_comment_likes_uniq ON public.character_comment_likes USING btree (user_id, comment_id);


--
-- Name: character_comments_char_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_comments_char_idx ON public.character_comments USING btree (character_id, created_at);


--
-- Name: character_comments_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_comments_parent_idx ON public.character_comments USING btree (parent_id);


--
-- Name: character_decisions_trigger_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX character_decisions_trigger_uniq ON public.character_decisions USING btree (session_id, trigger_key);


--
-- Name: character_life_events_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_life_events_session_idx ON public.character_life_events USING btree (session_id, occurred_at);


--
-- Name: character_likes_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX character_likes_uniq ON public.character_likes USING btree (character_id, user_id);


--
-- Name: character_revisions_hash_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX character_revisions_hash_uniq ON public.character_revisions USING btree (character_id, source_hash);


--
-- Name: character_runtime_states_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX character_runtime_states_due_idx ON public.character_runtime_states USING btree (next_wake_at) WHERE (next_wake_at IS NOT NULL);


--
-- Name: characters_experience_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_experience_idx ON public.characters USING btree (experience_type);


--
-- Name: characters_official_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_official_idx ON public.characters USING btree (is_official);


--
-- Name: characters_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_owner_idx ON public.characters USING btree (owner_id);


--
-- Name: characters_public_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_public_idx ON public.characters USING btree (is_public);


--
-- Name: characters_visible_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX characters_visible_recent_idx ON public.characters USING btree (created_at DESC, id DESC) WHERE ((deleted_at IS NULL) AND (is_draft = false));


--
-- Name: command_book_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX command_book_owner_idx ON public.command_book USING btree (owner_id);


--
-- Name: command_book_public_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX command_book_public_idx ON public.command_book USING btree (is_public, uses DESC) WHERE (deleted_at IS NULL);


--
-- Name: conversation_requests_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_requests_session_idx ON public.conversation_requests USING btree (session_id, status);


--
-- Name: conversation_requests_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_requests_user_idx ON public.conversation_requests USING btree (user_id);


--
-- Name: cvi_character_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cvi_character_idx ON public.character_visual_identities USING btree (character_id);


--
-- Name: events_resolved_cooldown_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_resolved_cooldown_idx ON public.events USING btree (session_id, cooldown_until_turn DESC, type, id DESC) WHERE (status = 'resolved'::text);


--
-- Name: events_resolved_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_resolved_recent_idx ON public.events USING btree (session_id, resolved_at_turn DESC NULLS LAST, id DESC) WHERE (status = 'resolved'::text);


--
-- Name: events_session_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_session_status_idx ON public.events USING btree (session_id, status);


--
-- Name: media_cache_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_cache_idx ON public.generated_media USING btree (character_id, kind, cache_key);


--
-- Name: media_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_session_idx ON public.generated_media USING btree (session_id, created_at);


--
-- Name: memories_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memories_session_idx ON public.memories USING btree (session_id, importance);


--
-- Name: memories_tags_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memories_tags_idx ON public.memories USING gin (tags);


--
-- Name: memory_jobs_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_jobs_due_idx ON public.memory_jobs USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'running'::text]));


--
-- Name: memory_jobs_message_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX memory_jobs_message_uniq ON public.memory_jobs USING btree (session_id, message_id, kind);


--
-- Name: memory_jobs_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX memory_jobs_session_idx ON public.memory_jobs USING btree (session_id, through_turn, created_at);


--
-- Name: messages_archive_preview_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_archive_preview_idx ON public.messages USING btree (session_id, created_at DESC, id DESC) WHERE (hidden_at IS NULL);


--
-- Name: messages_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_session_idx ON public.messages USING btree (session_id, turn_index);


--
-- Name: messenger_inbox_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messenger_inbox_due_idx ON public.messenger_inbox USING btree (next_review_at, session_id) WHERE (status = ANY (ARRAY['unread'::text, 'read'::text]));


--
-- Name: messenger_inbox_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messenger_inbox_session_idx ON public.messenger_inbox USING btree (session_id);


--
-- Name: npcs_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX npcs_session_idx ON public.npcs USING btree (session_id, is_active);


--
-- Name: payment_events_provider_event_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payment_events_provider_event_uniq ON public.payment_events USING btree (provider, external_event_id);


--
-- Name: payment_events_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_events_ref_idx ON public.payment_events USING btree (external_ref);


--
-- Name: push_subscriptions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions USING btree (user_id);


--
-- Name: reality_contacts_session_dedupe_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reality_contacts_session_dedupe_uniq ON public.reality_contacts USING btree (session_id, dedupe_key);


--
-- Name: reality_contacts_session_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reality_contacts_session_status_idx ON public.reality_contacts USING btree (session_id, status, sent_at);


--
-- Name: reality_push_jobs_delivery_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reality_push_jobs_delivery_uniq ON public.reality_push_jobs USING btree (contact_id, subscription_id);


--
-- Name: reality_push_jobs_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reality_push_jobs_due_idx ON public.reality_push_jobs USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'sending'::text]));


--
-- Name: reality_push_jobs_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reality_push_jobs_subscription_idx ON public.reality_push_jobs USING btree (subscription_id);


--
-- Name: recharge_grants_payment_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX recharge_grants_payment_uniq ON public.recharge_grants USING btree (provider, external_ref) WHERE ((provider IS NOT NULL) AND (external_ref IS NOT NULL));


--
-- Name: recharge_grants_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recharge_grants_user_active_idx ON public.recharge_grants USING btree (user_id, expires_at, created_at) WHERE (status = 'active'::text);


--
-- Name: recharge_ledger_ledger_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recharge_ledger_ledger_idx ON public.recharge_ledger USING btree (ledger_id);


--
-- Name: reports_reporter_target_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reports_reporter_target_uniq ON public.reports USING btree (reporter_id, target_type, target_id);


--
-- Name: reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_status_idx ON public.reports USING btree (status, created_at);


--
-- Name: roleplay_sessions_mode_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roleplay_sessions_mode_lookup_idx ON public.roleplay_sessions USING btree (user_id, character_id, adult_since) WHERE ((deleted_at IS NULL) AND (status = 'active'::text));


--
-- Name: scenes_session_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scenes_session_key_idx ON public.scenes USING btree (session_id, scene_key);


--
-- Name: sessions_active_character_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_active_character_user_idx ON public.roleplay_sessions USING btree (character_id, user_id) WHERE (deleted_at IS NULL);


--
-- Name: sessions_last_interaction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_last_interaction_idx ON public.roleplay_sessions USING btree (last_interaction_at);


--
-- Name: sessions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_idx ON public.roleplay_sessions USING btree (user_id, status);


--
-- Name: speech_allocations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_allocations_user_idx ON public.speech_credit_allocations USING btree (user_id, created_at);


--
-- Name: speech_grants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_grants_user_idx ON public.speech_credit_grants USING btree (user_id, created_at);


--
-- Name: speech_jobs_daily_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_jobs_daily_idx ON public.speech_synthesis_jobs USING btree (created_at);


--
-- Name: speech_jobs_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_jobs_due_idx ON public.speech_synthesis_jobs USING btree (created_at) WHERE (state = 'queued'::text);


--
-- Name: speech_jobs_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_jobs_message_idx ON public.speech_synthesis_jobs USING btree (message_id);


--
-- Name: speech_jobs_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_jobs_session_idx ON public.speech_synthesis_jobs USING btree (session_id);


--
-- Name: speech_jobs_usage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_jobs_usage_idx ON public.speech_synthesis_jobs USING btree (user_id, created_at);


--
-- Name: speech_trial_once_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX speech_trial_once_idx ON public.speech_credit_grants USING btree (user_id) WHERE (kind = 'trial'::text);


--
-- Name: speech_usage_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_usage_active_idx ON public.speech_synthesis_usage USING btree (state) WHERE (state = ANY (ARRAY['running'::text, 'uncertain'::text]));


--
-- Name: speech_usage_daily_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_usage_daily_idx ON public.speech_synthesis_usage USING btree (created_at);


--
-- Name: speech_usage_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speech_usage_user_idx ON public.speech_synthesis_usage USING btree (user_key, created_at);


--
-- Name: state_transitions_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX state_transitions_session_idx ON public.state_transitions USING btree (session_id, created_at DESC);


--
-- Name: state_transitions_trigger_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX state_transitions_trigger_uniq ON public.state_transitions USING btree (session_id, trigger_key, seq);


--
-- Name: story_changes_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_changes_run_idx ON public.story_changes USING btree (run_id, id);


--
-- Name: story_contacts_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_contacts_due_idx ON public.story_contacts USING btree (due_at) WHERE (status = 'pending'::text);


--
-- Name: story_contacts_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_contacts_key_uniq ON public.story_contacts USING btree (run_id, key);


--
-- Name: story_messages_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_messages_run_idx ON public.story_messages USING btree (run_id, created_at);


--
-- Name: story_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_messages_thread_idx ON public.story_messages USING btree (run_id, thread, created_at DESC, id DESC) WHERE (channel = 'dm'::text);


--
-- Name: story_push_jobs_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_push_jobs_due_idx ON public.story_push_jobs USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'sending'::text]));


--
-- Name: story_push_jobs_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_push_jobs_subscription_idx ON public.story_push_jobs USING btree (subscription_id);


--
-- Name: story_runs_live_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_runs_live_uniq ON public.story_runs USING btree (user_id, story_id, ((adult_since IS NOT NULL))) WHERE (status <> 'archived'::text);


--
-- Name: story_runs_no_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_runs_no_uniq ON public.story_runs USING btree (user_id, story_id, run_no);


--
-- Name: story_runs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX story_runs_user_idx ON public.story_runs USING btree (user_id);


--
-- Name: story_turns_client_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_turns_client_uniq ON public.story_turns USING btree (run_id, client_turn_id);


--
-- Name: story_turns_running_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX story_turns_running_uniq ON public.story_turns USING btree (run_id) WHERE (status = 'running'::text);


--
-- Name: usage_ledger_window_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_ledger_window_idx ON public.usage_ledger USING btree (window_id);


--
-- Name: usage_windows_monthly_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX usage_windows_monthly_uniq ON public.usage_windows USING btree (user_id, started_at) WHERE (period = 'monthly'::text);


--
-- Name: usage_windows_user_ends_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX usage_windows_user_ends_idx ON public.usage_windows USING btree (user_id, ends_at);


--
-- Name: user_moments_session_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_moments_session_idx ON public.user_moments USING btree (session_id, event_at) WHERE (status = 'active'::text);


--
-- Name: users_adult_verify_di_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_adult_verify_di_unique ON public.users USING btree (adult_verify_di);


--
-- Name: voice_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_jobs_status_idx ON public.voice_jobs USING btree (status, created_at);


--
-- Name: worlds_character_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX worlds_character_order_idx ON public.worlds USING btree (character_id, id);


--
-- Name: characters character_search_character_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER character_search_character_changed AFTER INSERT OR UPDATE OF name, tagline, occupation, role, relationship_keywords ON public.characters FOR EACH ROW EXECUTE FUNCTION miro_perf.character_search_character_changed();


--
-- Name: worlds character_search_world_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER character_search_world_changed AFTER INSERT OR DELETE OR UPDATE OF character_id, genre ON public.worlds FOR EACH ROW EXECUTE FUNCTION miro_perf.character_search_world_changed();


--
-- Name: characters cleanup_character_play; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER cleanup_character_play AFTER DELETE ON public.characters DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION miro_perf.cleanup_character_play();


--
-- Name: characters refresh_character_play_order; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER refresh_character_play_order AFTER UPDATE OF created_at ON public.characters FOR EACH ROW EXECUTE FUNCTION miro_perf.refresh_character_play_order();


--
-- Name: roleplay_sessions roleplay_session_play_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER roleplay_session_play_changed AFTER INSERT OR DELETE OR UPDATE OF character_id, user_id, deleted_at ON public.roleplay_sessions FOR EACH ROW EXECUTE FUNCTION miro_perf.roleplay_session_play_changed();


--
-- Name: character_backfill_state character_backfill_state_character_id_fkey; Type: FK CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_backfill_state
    ADD CONSTRAINT character_backfill_state_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_play_counts character_play_counts_character_fk; Type: FK CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_play_counts
    ADD CONSTRAINT character_play_counts_character_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_play_users character_play_users_character_fk; Type: FK CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_play_users
    ADD CONSTRAINT character_play_users_character_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_search_docs character_search_docs_character_id_fkey; Type: FK CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_search_docs
    ADD CONSTRAINT character_search_docs_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_search_docs character_search_docs_world_id_fkey; Type: FK CONSTRAINT; Schema: miro_perf; Owner: -
--

ALTER TABLE ONLY miro_perf.character_search_docs
    ADD CONSTRAINT character_search_docs_world_id_fkey FOREIGN KEY (world_id) REFERENCES public.worlds(id) ON DELETE CASCADE;


--
-- Name: account_deletions account_deletions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletions
    ADD CONSTRAINT account_deletions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: accounts accounts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_actions admin_actions_admin_id_admin_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_admin_id_admin_users_id_fk FOREIGN KEY (admin_id) REFERENCES public.admin_users(id);


--
-- Name: admin_actions admin_actions_bank_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_bank_order_id_fkey FOREIGN KEY (bank_order_id) REFERENCES public.bank_transfer_orders(id) ON DELETE SET NULL;


--
-- Name: admin_actions admin_actions_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE SET NULL;


--
-- Name: admin_actions admin_actions_report_id_reports_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_actions
    ADD CONSTRAINT admin_actions_report_id_reports_id_fk FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;


--
-- Name: admin_sessions admin_sessions_admin_id_admin_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_sessions
    ADD CONSTRAINT admin_sessions_admin_id_admin_users_id_fk FOREIGN KEY (admin_id) REFERENCES public.admin_users(id) ON DELETE CASCADE;


--
-- Name: ai_evaluation_samples ai_evaluation_samples_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_evaluation_samples
    ADD CONSTRAINT ai_evaluation_samples_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.conversation_requests(id) ON DELETE CASCADE;


--
-- Name: ai_evaluation_samples ai_evaluation_samples_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_evaluation_samples
    ADD CONSTRAINT ai_evaluation_samples_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_feedback ai_feedback_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedback
    ADD CONSTRAINT ai_feedback_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.conversation_requests(id) ON DELETE CASCADE;


--
-- Name: ai_feedback ai_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_feedback
    ADD CONSTRAINT ai_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: alpha_waitlist alpha_waitlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alpha_waitlist
    ADD CONSTRAINT alpha_waitlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: analytics_events analytics_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_events
    ADD CONSTRAINT analytics_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: auth_sessions auth_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_sessions
    ADD CONSTRAINT auth_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bank_telegram_requests bank_telegram_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_telegram_requests
    ADD CONSTRAINT bank_telegram_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.bank_transfer_orders(id) ON DELETE CASCADE;


--
-- Name: bank_transfer_orders bank_transfer_orders_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_orders
    ADD CONSTRAINT bank_transfer_orders_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.admin_users(id);


--
-- Name: bank_transfer_orders bank_transfer_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transfer_orders
    ADD CONSTRAINT bank_transfer_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: call_sessions call_sessions_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_sessions
    ADD CONSTRAINT call_sessions_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: character_bookmarks character_bookmarks_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_bookmarks
    ADD CONSTRAINT character_bookmarks_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_bookmarks character_bookmarks_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_bookmarks
    ADD CONSTRAINT character_bookmarks_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: character_comment_likes character_comment_likes_comment_id_character_comments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_comment_likes
    ADD CONSTRAINT character_comment_likes_comment_id_character_comments_id_fk FOREIGN KEY (comment_id) REFERENCES public.character_comments(id) ON DELETE CASCADE;


--
-- Name: character_comment_likes character_comment_likes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_comment_likes
    ADD CONSTRAINT character_comment_likes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: character_comments character_comments_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_comments
    ADD CONSTRAINT character_comments_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_comments character_comments_parent_id_character_comments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_comments
    ADD CONSTRAINT character_comments_parent_id_character_comments_id_fk FOREIGN KEY (parent_id) REFERENCES public.character_comments(id) ON DELETE CASCADE;


--
-- Name: character_comments character_comments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_comments
    ADD CONSTRAINT character_comments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: character_decisions character_decisions_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_decisions
    ADD CONSTRAINT character_decisions_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.character_revisions(id) ON DELETE CASCADE;


--
-- Name: character_decisions character_decisions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_decisions
    ADD CONSTRAINT character_decisions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: character_life_events character_life_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_life_events
    ADD CONSTRAINT character_life_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: character_likes character_likes_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_likes
    ADD CONSTRAINT character_likes_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_likes character_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_likes
    ADD CONSTRAINT character_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: character_revisions character_revisions_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_revisions
    ADD CONSTRAINT character_revisions_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: character_runtime_states character_runtime_states_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_runtime_states
    ADD CONSTRAINT character_runtime_states_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.character_revisions(id) ON DELETE CASCADE;


--
-- Name: character_runtime_states character_runtime_states_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_runtime_states
    ADD CONSTRAINT character_runtime_states_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: character_visual_identities character_visual_identities_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.character_visual_identities
    ADD CONSTRAINT character_visual_identities_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: characters characters_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: characters characters_voice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characters
    ADD CONSTRAINT characters_voice_id_fkey FOREIGN KEY (voice_id) REFERENCES public.official_voices(id) ON DELETE SET NULL;


--
-- Name: command_book command_book_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.command_book
    ADD CONSTRAINT command_book_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: contact_profiles contact_profiles_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_profiles
    ADD CONSTRAINT contact_profiles_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: conversation_requests conversation_requests_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_requests
    ADD CONSTRAINT conversation_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: conversation_requests conversation_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_requests
    ADD CONSTRAINT conversation_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: events events_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: generated_media generated_media_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_media
    ADD CONSTRAINT generated_media_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: generated_media generated_media_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_media
    ADD CONSTRAINT generated_media_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: generated_media generated_media_visual_identity_id_character_visual_identities_; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_media
    ADD CONSTRAINT generated_media_visual_identity_id_character_visual_identities_ FOREIGN KEY (visual_identity_id) REFERENCES public.character_visual_identities(id) ON DELETE SET NULL;


--
-- Name: memories memories_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: memories memories_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memories
    ADD CONSTRAINT memories_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: memory_jobs memory_jobs_character_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_jobs
    ADD CONSTRAINT memory_jobs_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: memory_jobs memory_jobs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_jobs
    ADD CONSTRAINT memory_jobs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: memory_jobs memory_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memory_jobs
    ADD CONSTRAINT memory_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: messenger_inbox messenger_inbox_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messenger_inbox
    ADD CONSTRAINT messenger_inbox_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.reality_contacts(id) ON DELETE SET NULL;


--
-- Name: messenger_inbox messenger_inbox_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messenger_inbox
    ADD CONSTRAINT messenger_inbox_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: messenger_inbox messenger_inbox_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messenger_inbox
    ADD CONSTRAINT messenger_inbox_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: npcs npcs_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.npcs
    ADD CONSTRAINT npcs_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: payment_events payment_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_events
    ADD CONSTRAINT payment_events_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reality_contacts reality_contacts_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_contacts
    ADD CONSTRAINT reality_contacts_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: reality_push_jobs reality_push_jobs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_push_jobs
    ADD CONSTRAINT reality_push_jobs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.reality_contacts(id) ON DELETE CASCADE;


--
-- Name: reality_push_jobs reality_push_jobs_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reality_push_jobs
    ADD CONSTRAINT reality_push_jobs_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.push_subscriptions(id) ON DELETE CASCADE;


--
-- Name: recharge_grants recharge_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_grants
    ADD CONSTRAINT recharge_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: recharge_ledger recharge_ledger_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_ledger
    ADD CONSTRAINT recharge_ledger_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.recharge_grants(id) ON DELETE RESTRICT;


--
-- Name: recharge_ledger recharge_ledger_ledger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_ledger
    ADD CONSTRAINT recharge_ledger_ledger_id_fkey FOREIGN KEY (ledger_id) REFERENCES public.usage_ledger(id) ON DELETE CASCADE;


--
-- Name: relationships relationships_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationships
    ADD CONSTRAINT relationships_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: reports reports_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE SET NULL;


--
-- Name: reports reports_reporter_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reporter_id_users_id_fk FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE SET NULL;


--
-- Name: roleplay_sessions roleplay_sessions_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roleplay_sessions
    ADD CONSTRAINT roleplay_sessions_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: roleplay_sessions roleplay_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roleplay_sessions
    ADD CONSTRAINT roleplay_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: roleplay_sessions roleplay_sessions_world_id_worlds_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roleplay_sessions
    ADD CONSTRAINT roleplay_sessions_world_id_worlds_id_fk FOREIGN KEY (world_id) REFERENCES public.worlds(id);


--
-- Name: scenes scenes_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenes
    ADD CONSTRAINT scenes_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: speech_credit_allocations speech_credit_allocations_grant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_credit_allocations
    ADD CONSTRAINT speech_credit_allocations_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.speech_credit_grants(id) ON DELETE CASCADE;


--
-- Name: speech_credit_allocations speech_credit_allocations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_credit_allocations
    ADD CONSTRAINT speech_credit_allocations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: speech_credit_grants speech_credit_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_credit_grants
    ADD CONSTRAINT speech_credit_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: speech_synthesis_jobs speech_synthesis_jobs_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_synthesis_jobs
    ADD CONSTRAINT speech_synthesis_jobs_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;


--
-- Name: speech_synthesis_jobs speech_synthesis_jobs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_synthesis_jobs
    ADD CONSTRAINT speech_synthesis_jobs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: speech_synthesis_jobs speech_synthesis_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speech_synthesis_jobs
    ADD CONSTRAINT speech_synthesis_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: state_transitions state_transitions_revision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.state_transitions
    ADD CONSTRAINT state_transitions_revision_id_fkey FOREIGN KEY (revision_id) REFERENCES public.character_revisions(id) ON DELETE SET NULL;


--
-- Name: state_transitions state_transitions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.state_transitions
    ADD CONSTRAINT state_transitions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: story_changes story_changes_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_changes
    ADD CONSTRAINT story_changes_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.story_runs(id) ON DELETE CASCADE;


--
-- Name: story_changes story_changes_turn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_changes
    ADD CONSTRAINT story_changes_turn_id_fkey FOREIGN KEY (turn_id) REFERENCES public.story_turns(id) ON DELETE SET NULL;


--
-- Name: story_contacts story_contacts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_contacts
    ADD CONSTRAINT story_contacts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.story_runs(id) ON DELETE CASCADE;


--
-- Name: story_messages story_messages_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages
    ADD CONSTRAINT story_messages_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.story_runs(id) ON DELETE CASCADE;


--
-- Name: story_messages story_messages_turn_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_messages
    ADD CONSTRAINT story_messages_turn_id_fkey FOREIGN KEY (turn_id) REFERENCES public.story_turns(id) ON DELETE SET NULL;


--
-- Name: story_private story_private_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_private
    ADD CONSTRAINT story_private_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_push_jobs story_push_jobs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_push_jobs
    ADD CONSTRAINT story_push_jobs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.story_contacts(id) ON DELETE CASCADE;


--
-- Name: story_push_jobs story_push_jobs_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_push_jobs
    ADD CONSTRAINT story_push_jobs_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.push_subscriptions(id) ON DELETE CASCADE;


--
-- Name: story_runs story_runs_story_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_runs
    ADD CONSTRAINT story_runs_story_id_fkey FOREIGN KEY (story_id) REFERENCES public.stories(id) ON DELETE CASCADE;


--
-- Name: story_runs story_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_runs
    ADD CONSTRAINT story_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: story_turns story_turns_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.story_turns
    ADD CONSTRAINT story_turns_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.story_runs(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: terms_consents terms_consents_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.terms_consents
    ADD CONSTRAINT terms_consents_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: usage_ledger usage_ledger_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: usage_ledger usage_ledger_window_id_usage_windows_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_window_id_usage_windows_id_fk FOREIGN KEY (window_id) REFERENCES public.usage_windows(id) ON DELETE CASCADE;


--
-- Name: usage_windows usage_windows_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_windows
    ADD CONSTRAINT usage_windows_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_moments user_moments_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_moments
    ADD CONSTRAINT user_moments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: user_personas user_personas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personas
    ADD CONSTRAINT user_personas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: world_states world_states_session_id_roleplay_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.world_states
    ADD CONSTRAINT world_states_session_id_roleplay_sessions_id_fk FOREIGN KEY (session_id) REFERENCES public.roleplay_sessions(id) ON DELETE CASCADE;


--
-- Name: worlds worlds_character_id_characters_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worlds
    ADD CONSTRAINT worlds_character_id_characters_id_fk FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE;


--
-- Name: account_deletions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_budget_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_budget_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_evaluation_samples; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_evaluation_samples ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_provider_leases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_provider_leases ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_telegram_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_telegram_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_transfer_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_transfer_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: call_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: character_comment_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_comment_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: character_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: character_life_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_life_events ENABLE ROW LEVEL SECURITY;

--
-- Name: character_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: character_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: character_runtime_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_runtime_states ENABLE ROW LEVEL SECURITY;

--
-- Name: character_visual_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.character_visual_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: characters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: conversation_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.generated_media ENABLE ROW LEVEL SECURITY;

--
-- Name: memories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

--
-- Name: memory_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memory_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messenger_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messenger_inbox ENABLE ROW LEVEL SECURITY;

--
-- Name: npcs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.npcs ENABLE ROW LEVEL SECURITY;

--
-- Name: official_voices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.official_voices ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_backup_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_backup_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_cron_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_cron_config ENABLE ROW LEVEL SECURITY;

--
-- Name: ops_heartbeats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ops_heartbeats ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reality_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reality_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: reality_push_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reality_push_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: recharge_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recharge_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: recharge_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recharge_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: roleplay_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roleplay_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: scenes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

--
-- Name: speech_credit_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speech_credit_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: speech_credit_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speech_credit_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: speech_synthesis_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speech_synthesis_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: speech_synthesis_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speech_synthesis_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: state_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: stories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

--
-- Name: story_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: story_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: story_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: story_private; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_private ENABLE ROW LEVEL SECURITY;

--
-- Name: story_push_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_push_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: story_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: story_turns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.story_turns ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: terms_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.terms_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_windows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_windows ENABLE ROW LEVEL SECURITY;

--
-- Name: user_moments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_moments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_personas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_personas ENABLE ROW LEVEL SECURITY;

--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: world_states; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.world_states ENABLE ROW LEVEL SECURITY;

--
-- Name: worlds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

