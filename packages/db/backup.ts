import postgres from 'postgres'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from './src/schema/index'

/**
 * 백업과 복구 리허설. 원본 DB 를 한 시점 스냅샷으로 pg_dump 해 임시 PG17 서버에 복원하고
 * 표별 행 수·체크섬(같은 스냅샷)과 검색 트리거 동작을 대조한다.
 *
 *   brew install postgresql@17   # 운영과 같은 메이저. 링크하지 않아도 된다.
 *   SOURCE_DATABASE_URL=... pnpm --filter @miro/db exec tsx backup.ts                    # 리허설: 끝나면 전부 지운다
 *   SOURCE_DATABASE_URL=... BACKUP_DIR=$HOME/miro-backup SUPABASE_URL=https://<ref>.supabase.co pnpm --filter @miro/db exec tsx backup.ts
 *   SOURCE_DATABASE_URL=... BACKUP_DIR=$HOME/miro-backup pnpm --filter @miro/db exec tsx backup.ts record
 *
 * 백업 모드는 검증을 통과한 덤프(db.dump)와 Storage 파일(storage/<버킷>/<경로>, 크기·md5 를 Storage 기록과 대조),
 * manifest.json 을 BACKUP_DIR 에 둔다. `record` 는 그 manifest 로 원본 DB 의 ops_backup_runs 에 한 줄 남긴다 —
 * 백업이 안전한 곳에 옮겨진 뒤에만 부른다(Actions 에서는 아티팩트 업로드 다음 단계). 기록이 36시간 넘게 없으면
 * 운영 크론이 Discord 로 알린다. 매일 도는 곳은 비공개 저장소 Noah1206/miro-backups 의 GitHub Actions 다.
 *
 * 원본에는 읽기 전용 트랜잭션만 연다(record 의 한 줄 제외). 앱 데이터는 public 과 miro_perf(검색 문서·플레이 수·
 * 트리거 함수) 두 스키마다. auth·storage 등 Supabase 스키마의 표는 덤프에 없다. 덤프에는 사용자 데이터와
 * ops_cron_config 의 크론 시크릿이 들어 있다 — BACKUP_DIR 은 이 (공개) 저장소 밖이어야 하고, 안이면 거부한다.
 */
const source = process.env.SOURCE_DATABASE_URL
if (!source) { console.error('SOURCE_DATABASE_URL required'); process.exit(1) }
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = process.env.BACKUP_DIR ? resolve(process.env.BACKUP_DIR) : null
if (outDir && (outDir === REPO || outDir.startsWith(REPO + sep))) {
  console.error(`BACKUP_DIR must be outside the repository (${REPO}) — it is public and the dump holds user data`)
  process.exit(1)
}
if (outDir && process.argv[2] !== 'record' && existsSync(join(outDir, 'manifest.json'))) {
  console.error(`BACKUP_DIR already holds a backup (${outDir}) — use an empty directory`)
  process.exit(1)
}
const BIN = process.env.PG17_BIN ?? '/opt/homebrew/opt/postgresql@17/bin'
const PORT = process.env.RESTORE_PORT ?? '55432'
const SCHEMAS = ['public', 'miro_perf']
const src = new URL(source)
if (src.port === '6543') src.port = '5432' // Supavisor 트랜잭션 풀러로는 pg_dump 스냅샷을 못 쓴다 — 세션 모드
const local = ['localhost', '127.0.0.1', '::1'].includes(src.hostname)
// 앱 클라이언트(src/client.ts)처럼 TLS 는 주소가 아니라 코드가 강제한다 — 앱의 DATABASE_URL 에는 sslmode 가 없다.
const connect = (url: string) => postgres(url, { max: 1, prepare: false, ssl: local ? false : 'require' })

type Manifest = {
  snapshotAt: string; source: string; schemas: string[]; dump: { file: string; bytes: number }
  tables: Record<string, string>; rows: number; storage: { bucket: string; name: string; size: number; md5: string }[]; warnings: string[]
}

if (process.argv[2] === 'record') {
  // 백업이 옮겨진 뒤에만 부른다. 실패하면 백업은 이미 안전하고, 기록이 없으니 36시간 뒤 알림이 간다.
  if (!outDir) { console.error('BACKUP_DIR required'); process.exit(1) }
  const m = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as Manifest
  const sql = connect(source)
  try {
    await sql`insert into ops_backup_runs (snapshot_at, db_tables, db_rows, db_bytes, files, file_bytes)
      values (${m.snapshotAt}::timestamptz, ${Object.keys(m.tables).length}, ${m.rows}, ${m.dump.bytes}, ${m.storage.length}, ${m.storage.reduce((a, f) => a + f.size, 0)})`
    console.log(`recorded backup of ${m.snapshotAt} in ops_backup_runs`)
  } finally { await sql.end({ timeout: 5 }) }
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), 'miro-restore-'))
const dump = join(dir, 'backup.dump')
// macOS 의 postmaster 는 로캘이 없으면 "multithreaded during startup" 으로 죽는다. 리눅스(Actions)엔 C.UTF-8 이 늘 있다.
const env = { ...process.env, LC_ALL: process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8' }
let serverUp = false
let cleaned = false
/** 임시 서버를 멈추고 덤프를 지운다. 오류·Ctrl-C·SIGTERM 어느 길로 끝나도 한 번 돈다 — 덤프에 운영 데이터가 있다. */
function cleanup() {
  if (cleaned) return
  cleaned = true
  if (serverUp) spawnSync(join(BIN, 'pg_ctl'), ['-D', join(dir, 'pg'), '-m', 'immediate', 'stop'], { env })
  rmSync(dir, { recursive: true, force: true })
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { cleanup(); process.exit(130) })

const run = (cmd: string, args: string[], extra: Record<string, string> = {}) => {
  const r = spawnSync(join(BIN, cmd), args, { env: { ...env, ...extra }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
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
type StorageObject = { bucket: string; name: string; size: number; etag: string | null; public: boolean }

/** Storage 파일을 받아 크기와 md5(단일 업로드의 eTag)를 Storage 기록과 대조한다. 하나라도 어긋나면 백업 전체가 실패한다. */
async function backupStorage(objects: StorageObject[], root: string) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
  if (objects.length && !base) throw new Error('SUPABASE_URL required to back up Storage files')
  const files: Manifest['storage'] = []
  for (const o of objects) {
    // 비공개 버킷은 서비스 키가 있어야 받는다 — 조용히 건너뛰지 않고 멈춘다.
    if (!o.public) throw new Error(`Storage bucket ${o.bucket} is private; this backup reads public URLs only`)
    const path = resolve(root, 'storage', o.bucket, o.name)
    if (!path.startsWith(resolve(root, 'storage') + sep)) throw new Error(`unsafe Storage object name: ${o.bucket}/${o.name}`)
    const url = `${base}/storage/v1/object/public/${encodeURIComponent(o.bucket)}/${o.name.split('/').map(encodeURIComponent).join('/')}`
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`Storage download ${o.bucket}/${o.name}: HTTP ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    const md5 = createHash('md5').update(bytes).digest('hex')
    const etag = o.etag?.replace(/"/g, '') ?? null
    if (bytes.length !== o.size) throw new Error(`Storage size mismatch ${o.bucket}/${o.name}: ${bytes.length} ≠ ${o.size}`)
    // 여러 조각 업로드의 eTag 는 "<md5>-<조각 수>" 라 파일 md5 와 다르다 — 그때는 크기만 본다.
    if (etag && !etag.includes('-') && etag !== md5) throw new Error(`Storage md5 mismatch ${o.bucket}/${o.name}`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
    files.push({ bucket: o.bucket, name: o.name, size: o.size, md5 })
  }
  return files
}

const started = Date.now()
let sourceSql: postgres.Sql | null = null
let restored: postgres.Sql | null = null
try {
  // 1) 원본: 스냅샷을 내보내고 pg_dump 가 같은 스냅샷을 읽게 한 뒤, 그 트랜잭션 안에서 체크섬과 Storage 목록
  sourceSql = connect(src.toString())
  const before = await sourceSql.begin('isolation level repeatable read read only', async (tx) => {
    await tx.unsafe(setup)
    const [{ snap, at }] = await tx`select pg_export_snapshot() snap, now()::text at`
    const tables = (await tx`select format('%I.%I', schemaname, tablename) t from pg_tables where schemaname in ${tx(SCHEMAS)} order by 1`).map((r) => r.t as string)
    const t0 = Date.now()
    run('pg_dump', ['-h', src.hostname, '-p', src.port || '5432', ...(src.username ? ['-U', decodeURIComponent(src.username)] : []), '-d', src.pathname.slice(1) || 'postgres',
      '-Fc', ...SCHEMAS.flatMap((s) => ['-n', s]), '--no-owner', '--no-privileges', `--snapshot=${snap}`, '-f', dump],
      { PGPASSWORD: decodeURIComponent(src.password), PGSSLMODE: local ? 'prefer' : 'require' })
    const dumpMs = Date.now() - t0
    const [{ storage }] = await tx`select to_regclass('storage.objects') is not null storage`
    const objects: StorageObject[] = storage ? (await tx`
      select o.bucket_id bucket, o.name, coalesce((o.metadata->>'size')::bigint, 0)::int size, o.metadata->>'eTag' etag, b.public
      from storage.objects o join storage.buckets b on b.id = o.bucket_id order by 1, 2`) as unknown as StorageObject[] : []
    return { at, tables, dumpMs, objects, sums: await checksums(tx, tables) }
  })
  await sourceSql.end({ timeout: 5 }); sourceSql = null

  // 2) 격리 환경: 임시 PG17 클러스터(localhost TCP 만)에 Supabase 역할·확장을 맞추고 한 트랜잭션으로 복원
  run('initdb', ['-D', join(dir, 'pg'), '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C.UTF-8'])
  serverUp = true
  run('pg_ctl', ['-D', join(dir, 'pg'), '-w', '-l', join(dir, 'pg.log'), '-o', `-p ${PORT} -k '' -c listen_addresses=127.0.0.1`, 'start'])
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

  // 3) 대조: 행 수·체크섬(보존 여부를 가른다), 검색 트리거. drizzle 조회는 경고만 — main 의 스키마가 아직 운영에
  //    적용 전이면(마이그레이션은 손으로 적용한다) 실패하는데, 그건 백업이 아니라 적용 누락의 신호다.
  restored = postgres(`postgres://postgres@127.0.0.1:${PORT}/miro_restore`, { max: 1 })
  await restored.unsafe(setup)
  const after = await checksums(restored, before.tables)
  const mismatched = before.tables.filter((t) => before.sums[t] !== after[t])
  const warnings: string[] = []
  const db = drizzle(restored, { schema })
  for (const v of Object.values(schema)) {
    if (!is(v, PgTable)) continue
    const { name, schema: s } = getTableConfig(v)
    if (!before.tables.includes(`${s ?? 'public'}.${name}`)) { warnings.push(`drizzle table ${name} is not in production (migration not applied?)`); continue }
    await db.select().from(v).limit(1).catch((e: Error) => warnings.push(`drizzle table ${name}: ${e.message}`))
  }
  let trigger = 'skipped (no characters)'
  await restored.begin(async (tx) => {
    const [c] = await tx`select id, name from characters where deleted_at is null limit 1`
    if (c) {
      await tx`update characters set name = ${`${c.name} 복원확인`} where id = ${c.id}`
      // 검색 문서는 캐릭터·세계관마다 하나씩이라 여러 개일 수 있다 — 전부 새 이름을 담아야 한다.
      const [d] = await tx`select count(*)::int n, count(*) filter (where search_text not like '%복원확인%')::int stale
        from miro_perf.character_search_docs where character_id = ${c.id}`
      trigger = d.n > 0 && d.stale === 0 ? 'ok' : `FAILED (${d.n} docs, ${d.stale} stale)`
    }
    throw new Error('rollback')
  }).catch((e: Error) => { if (e.message !== 'rollback') throw e })
  await restored.end({ timeout: 5 }); restored = null

  const rows = Object.values(before.sums).reduce((a, s) => a + Number(s.split(':')[0]), 0)
  const dbBytes = statSync(dump).size
  console.log(`snapshot ${before.at} · ${before.tables.length} tables · ${rows} rows · dump ${(dbBytes / 1024).toFixed(0)}KB in ${before.dumpMs}ms · restore ${restoreMs}ms`)
  console.log(`checksum mismatches ${mismatched.length}${mismatched.length ? ` ${mismatched.join(', ')}` : ''}`)
  console.log(`search trigger ${trigger}`)
  for (const w of warnings) console.log(`warning: ${w}`)
  if (mismatched.length || trigger.startsWith('FAILED')) throw new Error('restore verification failed — nothing kept')

  // 4) 백업 모드: 검증을 통과한 덤프만 남기고, Storage 파일을 받아 대조한 뒤, manifest 를 쓴다(기록은 `record` 가 따로)
  if (outDir) {
    mkdirSync(outDir, { recursive: true })
    copyFileSync(dump, join(outDir, 'db.dump'))
    const files = await backupStorage(before.objects, outDir)
    const manifest: Manifest = {
      snapshotAt: before.at, source: `${src.hostname}${src.pathname}`, schemas: SCHEMAS, dump: { file: 'db.dump', bytes: dbBytes },
      tables: before.sums, rows, storage: files, warnings,
    }
    // manifest 는 마지막에 쓴다 — 있으면 완성된 백업이다.
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
    console.log(`storage ${files.length} files · ${(files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(1)}MB · size and md5 match`)
    console.log(`backup kept in ${outDir}`)
  }
  console.log(`total ${((Date.now() - started) / 1000).toFixed(1)}s`)
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  // 열린 연결이 남으면 오류 뒤에도 프로세스가 끝나지 않는다(Actions 에서는 30분 제한까지 매달린다).
  await Promise.allSettled([sourceSql?.end({ timeout: 5 }), restored?.end({ timeout: 5 })])
  cleanup()
}
process.exit(process.exitCode ?? 0)
