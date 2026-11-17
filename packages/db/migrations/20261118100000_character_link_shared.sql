-- 11/18 링크 공개(바베챗 '링크공개') — 홈·검색에는 안 뜨고, 링크를 아는 사람만 상세를 보고 대화를 시작한다. 공개(is_public)가 꺼져 있을 때만 의미가 있다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS link_shared boolean NOT NULL DEFAULT false;
