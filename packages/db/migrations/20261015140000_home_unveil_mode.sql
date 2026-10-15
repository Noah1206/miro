-- CLI-generated; placed after the existing original-story migrations.
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS unveil_enabled boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS roleplay_sessions_mode_lookup_idx ON public.roleplay_sessions(user_id, character_id, adult_since) WHERE deleted_at IS NULL AND status = 'active';
