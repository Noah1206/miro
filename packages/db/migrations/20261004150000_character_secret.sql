-- 비공개 설정(2026-10-04): 속마음·숨긴 사정·행동 규칙. 프롬프트·성격표에만 실리고 상세 화면에는 보이지 않는다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS secret text;
