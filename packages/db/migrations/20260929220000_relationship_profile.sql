-- 캐릭터별 관계 성격표(2026-09-29 결정). 저장 때 AI 가 성격 설명에서 만들고 작성자가 편집기에서 고친다.
-- 비어 있으면 기본 규칙 — 기존 캐릭터는 그대로 동작한다. 코드보다 먼저 적용해야 한다(characters 를 읽는 모든 쿼리가 이 칼럼을 고른다).
ALTER TABLE characters ADD COLUMN IF NOT EXISTS relationship_profile jsonb;
