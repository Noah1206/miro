-- 11/21 사용자: 페르소나에 나이 칸(레퍼런스의 닉네임·나이·성별·상세정보). 비워도 된다 — 대화방별 페르소나(roleplay_sessions.user_persona jsonb)는 같은 값을 json 으로 갖는다.
ALTER TABLE user_personas ADD COLUMN IF NOT EXISTS age text;
