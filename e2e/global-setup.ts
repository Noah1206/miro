import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { testDatabaseUrl } from '../tooling/test-database'

/**
 * 테스트 DB 를 스키마까지 준비하고, 이전 실행이 남긴 데이터를 비운다.
 *
 * 전에는 이 단계가 없어서, 마이그레이션을 손으로 돌리지 않으면 51개 테스트가 모두
 * "타임아웃" 으로 죽었다 — 진짜 원인(42P01 relation does not exist)은 서버 로그
 * 안쪽에만 있었다. 실패가 원인을 말하지 않으면 그 테스트는 아무도 돌리지 않게 된다.
 *
 * 이미 마이그레이션된 DB 를 다시 쓰는 경우가 흔하므로(반복 실행), 각 파일은 실패해도
 * 넘어간다. 대신 끝에 스키마가 실제로 섰는지 확인하고, 아니면 여기서 멈춘다.
 */
export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined)
  if (!url) throw new Error('globalSetup: TEST_DATABASE_URL 이 없다')

  const dir = join(__dirname, '..', 'packages', 'db', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  let applied = 0
  for (const file of files) {
    try {
      execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-q', url, '-f', join(dir, file)],
        { stdio: 'pipe' })
      applied++
    } catch { /* 이미 적용된 마이그레이션. 아래 스키마 확인이 진짜 판정이다. */ }
  }

  // 판정은 "마이그레이션이 다 돌았나" 가 아니라 "쓸 수 있는 스키마인가" 다.
  const count = Number(execFileSync('psql', ['-X', '-tAq', url, '-c',
    "select count(*) from information_schema.tables where table_schema='public'"], { encoding: 'utf8' }).trim())
  if (!Number.isFinite(count) || count < 30) {
    throw new Error(`globalSetup: 테스트 DB 스키마가 준비되지 않았다 (테이블 ${count}개). ` +
      `DATABASE_URL=${url} pnpm db:migrate:sql 을 먼저 확인할 것.`)
  }
  // 이전 실행이 남긴 행을 비운다. 안 비우면 하루 몇 번만 돌려도 users 300·ai_usage 1100 행이 쌓여
  // 스위트가 1.4m → 2.4m 로 늘고, 서로 무관한 테스트가 첫 시도에서 타임아웃으로 흔들렸다 (2026-09-22).
  // 비우기 직전에 다시 검사한다 — 루트 .env 의 DATABASE_URL 은 운영 Supabase 다. 호스트가 localhost 가
  // 아니거나 이름이 _test 로 끝나지 않으면 여기서 던진다. 설정 테이블(ops_cron_config)은 남긴다.
  // 마이그레이션 메타 테이블은 없다(.sql 을 psql 로 직접 적용) — 생기면 아래 목록에 이름을 더한다.
  // Playwright 는 webServer 를 먼저 띄우고 globalSetup 을 돌린다 — 서버는 떠 있지만 테스트 요청은 아직 없어 비워도 안전하다.
  testDatabaseUrl(url)
  execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', url, '-c', `DO $$ DECLARE t text; BEGIN
    SELECT string_agg(quote_ident(tablename), ', ') INTO t FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT IN ('ops_cron_config', '__drizzle_migrations');
    EXECUTE 'TRUNCATE ' || t || ' RESTART IDENTITY CASCADE';
  END $$`], { stdio: 'pipe' })

  // 공식 캐릭터 시드. 테스트 대부분이 'thomas' 로 대화를 시작하므로, 없으면 "대화 시작하기"
  // 버튼을 60초 기다리다 죽는다 — 역시 원인을 말하지 않는 실패였다.
  // 시드는 slug 기준 upsert 라 반복 실행해도 늘지 않는다.
  execFileSync('npx', ['tsx', join(__dirname, '..', 'packages', 'db', 'seed.ts')],
    { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } })
  const characters = Number(execFileSync('psql', ['-X', '-tAq', url, '-c', 'select count(*) from characters'],
    { encoding: 'utf8' }).trim())
  if (!characters) throw new Error('globalSetup: 공식 캐릭터 시드가 비어 있다')

  // 운영자 계정. 사용자 앱에는 운영자 가입 경로가 없으므로 시드로만 생긴다 —
  // 없으면 admin/bank-transfer 테스트가 login?error=1 에서 멈춘다.
  // e2e/admin.spec.ts 와 bank-transfer.spec.ts 가 이 값을 그대로 쓴다.
  execFileSync('npx', ['tsx', join(__dirname, '..', 'packages', 'db', 'seed-admin.ts')], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url, ADMIN_SEED_EMAIL: ADMIN_EMAIL, ADMIN_SEED_PASSWORD: ADMIN_PASSWORD, ADMIN_SEED_ROLE: 'superadmin' },
  })

  console.info(`[e2e] 테스트 DB 준비됨 — 이전 데이터 비움, 테이블 ${count}개, 캐릭터 ${characters}명, 운영자 ${ADMIN_EMAIL}, 이번 실행에서 적용 ${applied}/${files.length}`)
}

/** e2e/admin.spec.ts · bank-transfer.spec.ts 가 입력하는 값과 같아야 한다. */
const ADMIN_EMAIL = 'e2e-admin@miro.dev'
const ADMIN_PASSWORD = 'admin-pass-123'
