import postgres from 'postgres'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import { is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from './src/schema/index'

/**
 * 백업 복구 리허설. 원본 DB 를 한 시점 스냅샷으로 pg_dump 해 임시 PG17 서버에 복원하고
 * 표별 행 수·체크섬(같은 스냅샷), drizzle 표 조회, 검색 트리거 동작을 대조한다.
 * 원본에는 읽기 전용 트랜잭션만 연다. 끝나면 덤프와 임시 서버를 지운다(덤프에는 사용자 데이터와
 * ops_cron_config 의 크론 시크릿이 들어 있다).
 *
 *   brew install postgresql@17   # 운영과 같은 메이저. 링크하지 않아도 된다.
 *   SOURCE_DATABASE_URL=... pnpm --filter @miro/db exec tsx restore-rehearsal.ts
 *
 * 앱 데이터는 public 과 miro_perf(검색 문서·플레이 수·트리거 함수) 두 스키마다. auth·storage 등
 * Supabase 스키마와 Storage 파일(character-images)은 이 백업에 없다.
 */
const source = process.env.SOURCE_DATABASE_URL
if (!source) { console.error('SOURCE_DATABASE_URL required'); process.exit(1) }
const BIN = process.env.PG17_BIN ?? '/opt/homebrew/opt/postgresql@17/bin'
const PORT = '55432'
const SCHEMAS = ['public', 'miro_perf']
const src = new URL(source)
if (src.port === '6543') src.port = '5432' // Supavisor 트랜잭션 풀러로는 pg_dump 스냅샷을 못 쓴다 — 세션 모드
const dir = mkdtempSync(join(tmpdir(), 'miro-restore-'))
const dump = join(dir, 'backup.dump')
const env = { ...process.env, LC_ALL: 'en_US.UTF-8' }
const run = (cmd: string, args: string[], extra: Record<string, string> = {}) => {
  const r = spawnSync(join(BIN, cmd), args, { env: { ...env, ...extra }, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.error}`)
  return r.stdout
}
// 행을 JSON 으로 해시한다 — 행 텍스트(t::text)는 한글 필드의 따옴표 여부가 OS 로캘마다 달라 거짓 불일치가 난다
const setup = `set timezone = 'UTC'; set datestyle = 'ISO, MDY'; set intervalstyle = 'postgres'; set extra_float_digits = 1`
const checksums = async (q: postgres.Sql | postgres.TransactionSql, tables: string[]) => {
  const out: Record<string, string> = {}
  for (const t of tables) {
    const [r] = await q.unsafe(`select count(*)::int n, md5(coalesce(string_agg(h, '' order by h collate "C"), '')) s from (select md5(row_to_json(t)::text) h from ${t} t) x`)
    out[t] = `${r.n}:${r.s}`
  }
  return out
}

const started = Date.now()
let serverUp = false
try {
  // 1) 원본: 스냅샷을 내보내고 pg_dump 가 같은 스냅샷을 읽게 한 뒤, 그 트랜잭션 안에서 체크섬
  const sourceSql = postgres(src.toString(), { max: 1, prepare: false })
  const before = await sourceSql.begin('isolation level repeatable read read only', async (tx) => {
    await tx.unsafe(setup)
    const [{ snap, at }] = await tx`select pg_export_snapshot() snap, now()::text at`
    const tables = (await tx`select format('%I.%I', schemaname, tablename) t from pg_tables where schemaname in ${tx(SCHEMAS)} order by 1`).map((r) => r.t as string)
    const t0 = Date.now()
    run('pg_dump', ['-h', src.hostname, '-p', src.port || '5432', ...(src.username ? ['-U', decodeURIComponent(src.username)] : []), '-d', src.pathname.slice(1) || 'postgres',
      '-Fc', ...SCHEMAS.flatMap((s) => ['-n', s]), '--no-owner', '--no-privileges', `--snapshot=${snap}`, '-f', dump],
      { PGPASSWORD: decodeURIComponent(src.password), PGSSLMODE: src.hostname === 'localhost' || src.hostname === '127.0.0.1' ? 'prefer' : 'require' })
    return { at, tables, dumpMs: Date.now() - t0, sums: await checksums(tx, tables) }
  })
  await sourceSql.end()

  // 2) 격리 환경: 임시 PG17 클러스터(localhost TCP 만)에 Supabase 역할·확장을 맞추고 한 트랜잭션으로 복원
  run('initdb', ['-D', join(dir, 'pg'), '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C.UTF-8'])
  run('pg_ctl', ['-D', join(dir, 'pg'), '-w', '-l', join(dir, 'pg.log'), '-o', `-p ${PORT} -k '' -c listen_addresses=127.0.0.1`, 'start'])
  serverUp = true
  const psql = (db: string, c: string) => run('psql', ['-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qc', c])
  psql('postgres', 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN')
  psql('postgres', 'CREATE DATABASE miro_restore')
  // 운영은 extensions 스키마, 로컬 테스트 DB 는 public 에 pg_trgm 이 있다 — 덤프가 가리키는 쪽에 만든다
  const trgm = run('pg_restore', ['-s', '-f', '-', dump]).match(/(\w+)\.gin_trgm_ops/)?.[1] ?? 'extensions'
  psql('miro_restore', `CREATE SCHEMA IF NOT EXISTS ${trgm}; CREATE EXTENSION pg_trgm WITH SCHEMA ${trgm}`)
  const toc = run('pg_restore', ['-l', dump]).split('\n').filter((l) => !/ (SCHEMA - public|COMMENT - SCHEMA public) /.test(l))
  writeFileSync(join(dir, 'toc.txt'), toc.join('\n'))
  const t1 = Date.now()
  run('pg_restore', ['-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'miro_restore', '--no-owner', '--no-privileges',
    '--exit-on-error', '--single-transaction', '-L', join(dir, 'toc.txt'), dump])
  const restoreMs = Date.now() - t1

  // 3) 대조: 행 수·체크섬, 앱 스키마로 모든 표 조회, 검색 트리거가 복원본에서 도는지(되돌림)
  const restored = postgres(`postgres://postgres@127.0.0.1:${PORT}/miro_restore`, { max: 1 })
  await restored.unsafe(setup)
  const after = await checksums(restored, before.tables)
  const mismatched = before.tables.filter((t) => before.sums[t] !== after[t])
  const db = drizzle(restored, { schema })
  const drizzleFailed: string[] = []
  let drizzleTables = 0
  for (const v of Object.values(schema)) {
    if (!is(v, PgTable)) continue
    drizzleTables++
    await db.select().from(v).limit(1).catch((e: Error) => drizzleFailed.push(`${getTableConfig(v).name}: ${e.message}`))
  }
  let trigger = 'skipped (no characters)'
  await restored.begin(async (tx) => {
    const [c] = await tx`select id, name from characters where deleted_at is null limit 1`
    if (c) {
      await tx`update characters set name = ${`${c.name} 복원확인`} where id = ${c.id}`
      const [d] = await tx`select count(*)::int n from miro_perf.character_search_docs where character_id = ${c.id} and search_text like '%복원확인%'`
      trigger = d.n === 1 ? 'ok' : 'FAILED'
    }
    throw new Error('rollback')
  }).catch((e: Error) => { if (e.message !== 'rollback') throw e })
  await restored.end()

  const rows = Object.values(before.sums).reduce((a, s) => a + Number(s.split(':')[0]), 0)
  console.log(`snapshot ${before.at} · ${before.tables.length} tables · ${rows} rows · dump ${(statSync(dump).size / 1024).toFixed(0)}KB in ${before.dumpMs}ms · restore ${restoreMs}ms`)
  console.log(`checksum mismatches ${mismatched.length}${mismatched.length ? ` ${mismatched.join(', ')}` : ''}`)
  console.log(`drizzle tables ${drizzleTables - drizzleFailed.length}/${drizzleTables} selectable${drizzleFailed.length ? ` ${drizzleFailed.join('; ')}` : ''}`)
  console.log(`search trigger ${trigger} · total ${((Date.now() - started) / 1000).toFixed(1)}s`)
  process.exitCode = mismatched.length || drizzleFailed.length || trigger === 'FAILED' ? 1 : 0
} finally {
  if (serverUp) spawnSync(join(BIN, 'pg_ctl'), ['-D', join(dir, 'pg'), '-m', 'fast', 'stop'], { env })
  rmSync(dir, { recursive: true, force: true })
}
