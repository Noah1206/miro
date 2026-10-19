-- 명령어 북(10/19). 채팅에서 `/이름` 으로 부르는 한 턴 지시. 공개 라이브러리 + 캐릭터별 복사본.
CREATE TABLE IF NOT EXISTS public.command_book (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  hint text NOT NULL DEFAULT '',
  prompt text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  uses integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS command_book_public_idx ON public.command_book (is_public, uses DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS command_book_owner_idx ON public.command_book (owner_id);
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS commands jsonb NOT NULL DEFAULT '[]'::jsonb;
