-- 로그인 토큰을 해시로(2026-10-03 점검). 코드는 'sha256:' + sha256(쿠키 토큰) 으로 찾는다 — 기존 원문 행을 같은 모양으로 바꿔 로그인을 유지한다.
-- 접두어가 있는 행은 건너뛰어 두 번 적용해도 안전하다.
UPDATE auth_sessions SET token = 'sha256:' || encode(sha256(convert_to(token, 'UTF8')), 'hex') WHERE token NOT LIKE 'sha256:%';
