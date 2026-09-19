import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 테스트 DB 를 스키마까지 준비한다.
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
  // 공식 캐릭터 시드. 테스트 대부분이 'thomas' 로 대화를 시작하므로, 없으면 "대화 시작하기"
  // 버튼을 60초 기다리다 죽는다 — 역시 원인을 말하지 않는 실패였다.
  // 시드는 slug 기준 upsert 라 반복 실행해도 늘지 않는다.
  execFileSync('npx', ['tsx', join(__dirname, '..', 'packages', 'db', 'seed.ts')],
    { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } })
  const characters = Number(execFileSync('psql', ['-X', '-tAq', url, '-c', 'select count(*) from characters'],
    { encoding: 'utf8' }).trim())
  if (!characters) throw new Error('globalSetup: 공식 캐릭터 시드가 비어 있다')

  console.info(`[e2e] 테스트 DB 준비됨 — 테이블 ${count}개, 캐릭터 ${characters}명, 이번 실행에서 적용 ${applied}/${files.length}`)
}
