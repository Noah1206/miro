-- 오리지널 스토리(10/15). 새 표만 추가한다 — 기존 캐릭터·대화·메시지는 건드리지 않는다.
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  audience text NOT NULL CHECK (audience IN ('reverse_harem','bl')),
  title text NOT NULL,
  public jsonb NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  seeded_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.story_private (
  story_id uuid PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE,
  definition jsonb NOT NULL,
  seeded_hash text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.story_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  run_no integer NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','archived')),
  definition_version integer NOT NULL,
  protagonist jsonb NOT NULL,
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  last_scene_input_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_runs_no_uniq ON public.story_runs (user_id, story_id, run_no);
CREATE UNIQUE INDEX IF NOT EXISTS story_runs_live_uniq ON public.story_runs (user_id, story_id) WHERE status <> 'archived';
CREATE TABLE IF NOT EXISTS public.story_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.story_runs(id) ON DELETE CASCADE,
  client_turn_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('scene','dm')),
  thread text,
  input_hash text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  base_version integer NOT NULL,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS story_turns_client_uniq ON public.story_turns (run_id, client_turn_id);
CREATE UNIQUE INDEX IF NOT EXISTS story_turns_running_uniq ON public.story_turns (run_id) WHERE status = 'running';
CREATE TABLE IF NOT EXISTS public.story_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.story_runs(id) ON DELETE CASCADE,
  turn_id uuid REFERENCES public.story_turns(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('scene','dm')),
  thread text,
  role text NOT NULL CHECK (role IN ('user','scene','character','system')),
  speaker text,
  content text NOT NULL,
  blocks jsonb,
  contact_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS story_messages_run_idx ON public.story_messages (run_id, created_at);
CREATE TABLE IF NOT EXISTS public.story_changes (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.story_runs(id) ON DELETE CASCADE,
  turn_id uuid REFERENCES public.story_turns(id) ON DELETE SET NULL,
  message_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS story_changes_run_idx ON public.story_changes (run_id, id);
CREATE TABLE IF NOT EXISTS public.story_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.story_runs(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  key text NOT NULL,
  speaker text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  due_at timestamptz NOT NULL,
  scheduled_scene integer NOT NULL,
  cause_turn_id uuid,
  reason text,
  message_id uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_contacts_key_uniq ON public.story_contacts (run_id, key);
CREATE INDEX IF NOT EXISTS story_contacts_due_idx ON public.story_contacts (due_at) WHERE status = 'pending';
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_contacts ENABLE ROW LEVEL SECURITY;
