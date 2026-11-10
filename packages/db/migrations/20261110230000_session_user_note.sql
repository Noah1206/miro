-- 11/10 유저노트(크랙 대비 긴 맥락 기준) — 사용자가 이 방에서 캐릭터가 반드시 기억하길 바라는 글(1000자). 매 턴 프롬프트 끝에 실린다.
ALTER TABLE roleplay_sessions ADD COLUMN IF NOT EXISTS user_note text NOT NULL DEFAULT '';
