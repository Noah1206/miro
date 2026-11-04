SET LOCAL lock_timeout = '5s';

-- 여러 인물 카드(하렘)의 히로인별 목소리(11/4) — { "히로인 이름": official_voices.id }. 같은 목소리를 여러 히로인이 같이 써도 된다. 비면 카드 목소리(voice_id) 하나.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS ensemble_voices jsonb NOT NULL DEFAULT '{}'::jsonb;
