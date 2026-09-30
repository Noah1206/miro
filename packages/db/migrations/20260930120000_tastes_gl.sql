-- 취향에 GL(여자와 여자의 이야기) 추가(2026-09-30 요청). 코드보다 먼저 적용한다 — 온보딩이 'gl' 을 저장한다.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tastes_known;
ALTER TABLE users ADD CONSTRAINT users_tastes_known CHECK (tastes <@ ARRAY['bl', 'hl', 'gl']::text[]);
