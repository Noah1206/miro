SET LOCAL lock_timeout = '5s';

-- 언베일 모델이 쓴 원문 표시. 화면에는 그대로, 상용 모델로 가는 기록에서는 요약으로 바뀐다.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_explicit boolean NOT NULL DEFAULT false;
