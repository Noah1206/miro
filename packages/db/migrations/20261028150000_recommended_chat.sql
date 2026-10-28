SET LOCAL lock_timeout = '5s';

-- 권장 대화 설정(10/28). 만들기 분류·설정 탭에서 고른 모델·출력량 — 새 채팅의 처음 선택값. 비어 있으면 서버 기본 모델.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS recommended_chat jsonb;
