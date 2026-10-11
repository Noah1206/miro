-- User-selected scene dates do not alter real-time contact or relationship state.
ALTER TABLE public.world_states ADD COLUMN IF NOT EXISTS narrative_calendar jsonb;
