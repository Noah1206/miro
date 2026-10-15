-- CLI-generated migration; ordered after the existing 12:00 original-story migrations.
CREATE TABLE IF NOT EXISTS public.story_push_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.story_contacts(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS story_push_jobs_due_idx ON public.story_push_jobs(next_attempt_at)
  WHERE status IN ('pending', 'sending');
CREATE INDEX IF NOT EXISTS story_push_jobs_subscription_idx ON public.story_push_jobs(subscription_id);
ALTER TABLE public.story_push_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_push_jobs FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS story_runs_user_idx ON public.story_runs(user_id);
CREATE INDEX IF NOT EXISTS story_messages_thread_idx ON public.story_messages(run_id, thread, created_at DESC, id DESC)
  WHERE channel = 'dm';
