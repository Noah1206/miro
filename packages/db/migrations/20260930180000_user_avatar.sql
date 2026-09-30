-- 프로필 사진(2026-09-30 요청: '나' 화면 연필로 닉네임·프로필 사진 편집). 코드보다 먼저 적용한다 — '나' 화면이 이 칸을 읽는다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
