-- 고른 시작 상황(2026-10-06): 인트로 줄의 scene 이름. NULL = 기본 도입부.
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS opening_scene text;
