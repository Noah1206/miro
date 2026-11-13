-- 11/13 성적 설정(아카 설계탭 BP 성적 설정) — 좋아함/싫어함/처음 허용선/잘 넘어가는 계기/끝난 뒤 반응.
-- 언베일이 켜진 방의 AI 지시문에만 실리고 화면에는 보이지 않는다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS intimacy text NOT NULL DEFAULT '';
