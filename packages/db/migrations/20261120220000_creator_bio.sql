-- 11/20 크리에이터 페이지 소개글(문의 링크·인사) — 본인이 크리에이터 페이지에서 쓴다. 비면 소개 줄을 그리지 않는다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_bio text NOT NULL DEFAULT '';
