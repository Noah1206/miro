SET LOCAL lock_timeout = '5s';

-- 기억 의미 검색(11/3): 기억마다 임베딩(256차원 실수 배열). 확장 기능(pgvector) 없이 앱에서 코사인으로 비교한다(방마다 기억 120개 이하).
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding real[];
