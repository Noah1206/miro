SET LOCAL lock_timeout = '5s';

-- 언베일 썸네일(11/4) — 대표 사진이 언베일 수위면 언베일을 안 켠 사람에게 흐리게 보이고 '언베일' 표시가 붙는다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS cover_unveil boolean NOT NULL DEFAULT false;
