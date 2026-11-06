-- 11/6: 첫 대화 전 페르소나 필수 여부를 만든 사람이 정한다. 기본은 꺼짐(바로 시작).
-- 이미 준비된 페르소나를 올려 둔 캐릭터만 지금처럼 필수로 둔다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS persona_required boolean NOT NULL DEFAULT false;
UPDATE characters SET persona_required = true WHERE jsonb_array_length(preset_personas) > 0;
