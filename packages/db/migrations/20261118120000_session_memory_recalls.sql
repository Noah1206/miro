-- 11/18 기억 노트 '떠올린 기억' — 턴마다 이번 입력과 맞아 떠올린 기억(최근 30턴, 새것이 앞).
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS memory_recalls jsonb NOT NULL DEFAULT '[]'::jsonb;
