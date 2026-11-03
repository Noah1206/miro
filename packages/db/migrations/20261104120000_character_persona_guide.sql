SET LOCAL lock_timeout = '5s';

-- 페르소나 작성 안내(11/4) — 첫 대화 전 세계관 카드에서 '이 세계에서의 나'를 쓸 때 보이는 안내문.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS persona_guide text NOT NULL DEFAULT '';
