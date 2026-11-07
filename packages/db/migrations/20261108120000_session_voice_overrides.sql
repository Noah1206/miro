-- 11/8: 대화방마다 사용자가 화자별 목소리를 고른다. { '': 주인공 목소리 id, '히로인 이름': 목소리 id }. 비어 있으면 자동.
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS voice_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
