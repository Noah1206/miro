-- 자율성 중심 응답 경로 전환(docs/agency-core-transition-plan.md) — 추가만 한다. 기존 표의 행·의미는 바꾸지 않는다.
-- 0단계: 호출별 출처. 어느 경로(turn-policy origin)에서 나온 호출인지 남겨 경로별 원가·지연을 비교한다.
ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS origin text;
