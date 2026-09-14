-- 나이를 정수 제한(18~99) 없이 자유 텍스트로 — "추정불가", "1000" 같은 값도 그대로 저장한다.
ALTER TABLE "characters" ALTER COLUMN "age" TYPE text USING "age"::text;
