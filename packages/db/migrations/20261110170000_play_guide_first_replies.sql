-- 11/10 플레이 가이드·추천 첫 답변(크랙 시작 설정) — 첫 화면에 사용자에게만 보이는 안내와, 첫 턴 입력창 위에 미리 띄우는 답 최대 3개. AI 에는 보내지 않는다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS play_guide text NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS first_replies jsonb NOT NULL DEFAULT '[]'::jsonb;
-- 엔딩(크랙 엔딩 설정) — 이름·등급·최소 턴·조건·에필로그·힌트.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS endings jsonb NOT NULL DEFAULT '[]'::jsonb;
