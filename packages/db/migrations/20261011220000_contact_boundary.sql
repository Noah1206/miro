-- Additive: existing conversations, relationship scores and memories remain untouched.
ALTER TABLE public.roleplay_sessions ADD COLUMN IF NOT EXISTS contact_boundary jsonb;
