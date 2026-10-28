SET LOCAL lock_timeout = '5s';

-- 이용 대상(10/28). 만들기 분류·설정 탭 — 성인(언베일)만이면 언베일을 켠 사람의 홈·탐색에만 나온다.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS adult_only boolean NOT NULL DEFAULT false;
