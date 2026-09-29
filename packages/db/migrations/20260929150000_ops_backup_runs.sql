-- 정기 백업 기록(2026-09-29): 백업 작업(비공개 저장소 miro-backups 의 GitHub Actions, packages/db/backup.ts)이
-- 임시 서버 복원 검증까지 통과한 뒤 한 줄 남긴다. 유지보수 크론이 마지막 기록이 36시간을 넘기면 운영자에게 알린다
-- (lib/ops/alerts). 추가 테이블만.
CREATE TABLE IF NOT EXISTS ops_backup_runs (
  id bigserial PRIMARY KEY,
  finished_at timestamptz NOT NULL DEFAULT now(),
  snapshot_at timestamptz NOT NULL,
  db_tables integer NOT NULL,
  db_rows integer NOT NULL,
  db_bytes integer NOT NULL,
  files integer NOT NULL,
  file_bytes bigint NOT NULL
);
ALTER TABLE ops_backup_runs ENABLE ROW LEVEL SECURITY;
