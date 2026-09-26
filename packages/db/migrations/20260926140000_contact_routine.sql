-- 캐릭터 생활 리듬(선연락·통화 응답·답장 지연의 근거). 추가 컬럼만 — 기존 행은 null = 활동 시간 규칙 그대로.
ALTER TABLE contact_profiles ADD COLUMN IF NOT EXISTS routine jsonb;
