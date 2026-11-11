-- 11/12 설정집(로어북) 한 턴 적용 개수 — 만든 사람이 1~20 으로 고른다(기본 6).
ALTER TABLE characters ADD COLUMN IF NOT EXISTS lore_limit integer NOT NULL DEFAULT 6;
