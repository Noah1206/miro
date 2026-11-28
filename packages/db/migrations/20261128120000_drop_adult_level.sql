-- 11/28 사용자: 안 쓰는 언베일 수위(은은하게·짙게) 삭제 — 모든 방이 explicit 이었고 코드가 더는 읽지 않는다.
ALTER TABLE roleplay_sessions DROP COLUMN IF EXISTS adult_level;
