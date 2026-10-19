-- 작품 회차 언베일(2026-10-19). adult_since = 이 회차에서 언베일이 처음 켜진 시각 — 한 번 켜진 회차는 꺼도 성인 전용 모델로 이어진다(대화방 adult_since 와 같은 규칙).
ALTER TABLE public.story_runs ADD COLUMN IF NOT EXISTS adult_since timestamptz;

-- 일반 회차와 성인용 회차를 작품마다 따로 하나씩 둔다 — 살아 있는 회차 고유 색인에 성인 여부를 더한다.
DROP INDEX IF EXISTS public.story_runs_live_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS story_runs_live_uniq ON public.story_runs (user_id, story_id, (adult_since IS NOT NULL)) WHERE status <> 'archived';
