import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { statfsSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { testDatabaseUrl } from './test-database.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STAGES = [10_000, 100_000, 1_000_000]
const USER_STAGES = [100, 500, 1_000]
const options = Object.fromEntries(process.argv.slice(3).map((argument) => {
  const match = /^--([a-z-]+)=(.+)$/.exec(argument)
  if (!match) throw new Error(`Expected --key=value, got ${argument}`)
  return [match[1], match[2]]
}))
const command = process.argv[2]
const databaseUrl = testDatabaseUrl(process.env.TEST_DATABASE_URL)
if (!databaseUrl) throw new Error('Set TEST_DATABASE_URL to a local *_test database; DATABASE_URL and root .env are ignored')
const database = new URL(databaseUrl)
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || !/^\/[a-z0-9_]+_test$/i.test(database.pathname)) {
  throw new Error('Performance fixtures require localhost and a database name ending in _test')
}

function checkResources(maxDbConnections = 80) {
  const disk = statfsSync(process.cwd())
  if (disk.bavail * disk.bsize < 2 * 1024 ** 3) throw new Error('Stopped: less than 2 GiB free disk')
  const connections = Number(query("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"))
  if (connections > maxDbConnections) throw new Error(`Stopped: ${connections} DB connections exceed ${maxDbConnections}`)
}

function integer(name, fallback, allowed) {
  const value = Number(options[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 0 || (allowed && !allowed.includes(value))) {
    throw new Error(`Invalid --${name}: ${options[name]}`)
  }
  return value
}

function runId() {
  const value = options['run-id']
  if (!value || !UUID.test(value)) throw new Error('Pass the UUID printed by seed as --run-id=<uuid>')
  return value.toLowerCase()
}

function query(sql) {
  return execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', databaseUrl, '-c', sql], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).trim()
}

function ownerEmail(id) { return `perf+${id}-owner@example.invalid` }
function userEmail(id, index) { return `perf+${id}-${index}@example.invalid` }

function fixture(id) {
  const owner = query(`SELECT id FROM users WHERE email = '${ownerEmail(id)}'`)
  if (!UUID.test(owner)) throw new Error(`No fixture owner for ${id}; run seed first`)
  return owner
}

function counts(id, owner) {
  const [characters, users, sessions, worlds, playSessions, worldStates, relationships, messages] = query(`
    SELECT (SELECT count(*) FROM characters WHERE owner_id = '${owner}'),
           (SELECT count(*) FROM users WHERE email LIKE 'perf+${id}-%@example.invalid' AND email <> '${ownerEmail(id)}'),
           (SELECT count(*) FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.email LIKE 'perf+${id}-%@example.invalid'),
           (SELECT count(*) FROM worlds w JOIN characters c ON c.id = w.character_id WHERE c.owner_id = '${owner}'),
           (SELECT count(*) FROM roleplay_sessions s JOIN users u ON u.id = s.user_id WHERE u.email LIKE 'perf+${id}-%@example.invalid'),
           (SELECT count(*) FROM world_states w JOIN roleplay_sessions s ON s.id = w.session_id JOIN users u ON u.id = s.user_id WHERE u.email LIKE 'perf+${id}-%@example.invalid'),
           (SELECT count(*) FROM relationships r JOIN roleplay_sessions s ON s.id = r.session_id JOIN users u ON u.id = s.user_id WHERE u.email LIKE 'perf+${id}-%@example.invalid'),
           (SELECT count(*) FROM messages m JOIN roleplay_sessions s ON s.id = m.session_id JOIN users u ON u.id = s.user_id WHERE u.email LIKE 'perf+${id}-%@example.invalid')
  `).split('\t').map(Number)
  return { characters, users, sessions, worlds, playSessions, worldStates, relationships, messages }
}

function seed() {
  const id = options['run-id'] ? runId() : randomUUID()
  const targetCharacters = integer('characters', 10_000, STAGES)
  const targetUsers = integer('users', 100, USER_STAGES)
  query(`INSERT INTO users (email, display_name) VALUES ('${ownerEmail(id)}', 'perf fixture owner') ON CONFLICT (email) DO NOTHING`)
  const owner = fixture(id)
  const before = counts(id, owner)
  if (before.characters > targetCharacters || before.users > targetUsers) throw new Error('Fixture already exceeds requested stage; use a new run ID')
  if (targetCharacters === 100_000 && before.characters < 10_000 || targetCharacters === 1_000_000 && before.characters < 100_000
    || targetUsers === 500 && before.users < 100 || targetUsers === 1_000 && before.users < 500) {
    throw new Error('Grow fixtures one stage at a time: characters 10k→100k→1m, users 100→500→1000')
  }
  const label = `PF${id.slice(0, 8)}`
  for (let start = before.characters + 1; start <= targetCharacters; start += 5_000) {
    const end = Math.min(start + 4_999, targetCharacters)
    testDatabaseUrl(databaseUrl)
    checkResources()
    query(`INSERT INTO characters (owner_id, name, personality, role, tagline, is_public, experience_type)
      SELECT '${owner}', '${label} ' || n::text, 'performance fixture', 'fixture', 'benchmark only', true,
             CASE WHEN n % 2 = 0 THEN 'chat' ELSE 'reality' END
      FROM generate_series(${start}, ${end}) AS n`)
    process.stderr.write(`Seeded character ${end}/${targetCharacters}\n`)
  }
  for (let start = before.users + 1; start <= targetUsers; start += 500) {
    const end = Math.min(start + 499, targetUsers)
    testDatabaseUrl(databaseUrl)
    checkResources()
    query(`INSERT INTO users (email, display_name)
      SELECT 'perf+${id}-' || n::text || '@example.invalid', 'perf virtual user'
      FROM generate_series(${start}, ${end}) AS n
      ON CONFLICT (email) DO NOTHING`)
    query(`INSERT INTO auth_sessions (user_id, token, expires_at)
      SELECT id, md5(id::text || '${id}'), now() + interval '1 day'
      FROM users WHERE email LIKE 'perf+${id}-%@example.invalid' AND email <> '${ownerEmail(id)}'
      ON CONFLICT (token) DO NOTHING`)
  }
  if (before.worlds === 0) {
    checkResources()
    query(`INSERT INTO worlds (character_id)
      SELECT id FROM characters WHERE owner_id = '${owner}' ORDER BY id LIMIT 100`)
  }
  query(`WITH ranked_worlds AS (
      SELECT w.id, w.character_id, row_number() OVER (ORDER BY w.character_id) AS position
      FROM worlds w JOIN characters c ON c.id = w.character_id WHERE c.owner_id = '${owner}'
    ), ranked_users AS (
      SELECT id, row_number() OVER (ORDER BY email) AS position
      FROM users WHERE email LIKE 'perf+${id}-%@example.invalid' AND email <> '${ownerEmail(id)}'
    )
    INSERT INTO roleplay_sessions (user_id, character_id, world_id)
    SELECT u.id, w.character_id, w.id FROM ranked_users u
    JOIN ranked_worlds w ON w.position = ((u.position - 1) % 100) + 1
    WHERE NOT EXISTS (SELECT 1 FROM roleplay_sessions s WHERE s.user_id = u.id)`)
  query(`INSERT INTO world_states (session_id, current_location, "current_time")
    SELECT s.id, 'performance fixture', 'day' FROM roleplay_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN world_states w ON w.session_id = s.id
    WHERE u.email LIKE 'perf+${id}-%@example.invalid' AND w.id IS NULL`)
  query(`INSERT INTO relationships (session_id)
    SELECT s.id FROM roleplay_sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN relationships r ON r.session_id = s.id
    WHERE u.email LIKE 'perf+${id}-%@example.invalid' AND r.id IS NULL`)
  query(`INSERT INTO messages (session_id, role, content, turn_index)
    SELECT s.id, 'user', 'Performance fixture', 0 FROM roleplay_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE u.email LIKE 'perf+${id}-%@example.invalid'
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id)`)
  const after = counts(id, owner)
  if (after.characters !== targetCharacters || after.users !== targetUsers || after.sessions !== targetUsers
    || after.worlds !== 100 || after.playSessions !== targetUsers || after.worldStates !== targetUsers
    || after.relationships !== targetUsers || after.messages !== targetUsers) {
    throw new Error(`Unexpected fixture counts: ${JSON.stringify(after)}; cleanup --run-id=${id}`)
  }
  process.stdout.write(`${JSON.stringify({ runId: id, label, ...after, next: `run --run-id=${id} --characters=${targetCharacters} --users=${targetUsers}` })}\n`)
}

function cleanup() {
  const id = runId()
  const owner = fixture(id)
  const before = counts(id, owner)
  testDatabaseUrl(databaseUrl)
  query(`BEGIN;
    DELETE FROM users WHERE email LIKE 'perf+${id}-%@example.invalid' AND email <> '${ownerEmail(id)}';
    DELETE FROM users WHERE id = '${owner}' AND email = '${ownerEmail(id)}';
    COMMIT;`)
  process.stdout.write(`${JSON.stringify({ runId: id, removed: before, remainingOwners: Number(query(`SELECT count(*) FROM users WHERE email = '${ownerEmail(id)}'`)) })}\n`)
}

function percentile(sorted, fraction) {
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null
}

function summary(samples, elapsedSeconds, offered, peakInflight) {
  const latencies = samples.filter((sample) => Number.isFinite(sample.ms)).map((sample) => sample.ms).sort((left, right) => left - right)
  const count = (kind) => samples.filter((sample) => sample.kind === kind).length
  return {
    offered, completed: samples.length, offeredRps: offered / elapsedSeconds, completedRps: samples.length / elapsedSeconds,
    p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95), p99Ms: percentile(latencies, 0.99),
    errors: count('error'), rateLimited: count('429'), timeouts: count('timeout'), empty: count('empty'),
    expectedEmpty: count('expectedEmpty'), unexpectedNonEmpty: count('unexpectedNonEmpty'),
    peakInflight,
  }
}

async function run() {
  const id = runId()
  const targetCharacters = integer('characters', 10_000, STAGES)
  const targetUsers = integer('users', 100, USER_STAGES)
  const durationSeconds = integer('duration-seconds', 30)
  const warmupSeconds = integer('warmup-seconds', 5)
  const thinkMs = integer('think-ms', 100)
  const timeoutMs = integer('timeout-ms', 10_000)
  const maxP95Ms = integer('max-p95-ms', 3_000)
  const maxDbConnections = integer('max-db-connections', 80)
  if (durationSeconds < 5 || durationSeconds > 600 || timeoutMs < 100 || timeoutMs > 60_000) throw new Error('Invalid duration or timeout')
  const origin = new URL(options.origin ?? 'http://127.0.0.1:3100')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || origin.protocol !== 'http:' || origin.port !== '3100' || origin.pathname !== '/' || origin.search) {
    throw new Error('HTTP target must be http://localhost:3100 or http://127.0.0.1:3100; never :3000 or a remote host')
  }
  const owner = fixture(id)
  const actual = counts(id, owner)
  if (actual.characters !== targetCharacters || actual.users !== targetUsers || actual.sessions !== targetUsers
    || actual.worlds !== 100 || actual.playSessions !== targetUsers || actual.worldStates !== targetUsers
    || actual.relationships !== targetUsers || actual.messages !== targetUsers) {
    throw new Error(`Fixture does not match requested stage: ${JSON.stringify(actual)}`)
  }
  const tokens = query(`SELECT s.token FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE u.email LIKE 'perf+${id}-%@example.invalid' AND u.email <> '${ownerEmail(id)}'
    ORDER BY u.email`).split('\n').filter(Boolean)
  if (tokens.length !== targetUsers || new Set(tokens).size !== targetUsers) throw new Error('Expected one distinct auth token per virtual user')
  const label = `PF${id.slice(0, 8)}`
  const marker = await fetch(new URL(`/api/home/search/cards?q=${label}`, origin), { signal: AbortSignal.timeout(timeoutMs) })
  if (!marker.ok) throw new Error(`Target fingerprint failed: HTTP ${marker.status}`)
  const markerData = await marker.json()
  if (!Array.isArray(markerData.items) || !markerData.items.some((item) => String(item.name).startsWith(label))) {
    throw new Error('Target does not expose this test fixture; check isolated server DATABASE_URL')
  }
  const popularStartedAt = performance.now()
  const popularResponse = await fetch(new URL('/api/home/cards?sort=popular', origin), { signal: AbortSignal.timeout(timeoutMs) })
  const popularData = await popularResponse.json()
  if (!popularResponse.ok || !Array.isArray(popularData) || popularData.length === 0) throw new Error('Popular probe failed or returned no fixture-backed cards')
  const popularFirstRequest = { ms: performance.now() - popularStartedAt, items: popularData.length, status: popularResponse.status }

  const stop = new AbortController()
  const samples = []
  const groups = new Map([['home', []], ['miro', []], ['search', []], ['searchMiss', []], ['popular', []]])
  const offeredByRoute = new Map([...groups.keys()].map((name) => [name, 0]))
  let offered = 0
  let inflight = 0
  let peakInflight = 0
  let stopReason = null
  const startedAt = performance.now()
  const warmUntil = startedAt + warmupSeconds * 1_000
  const endAt = warmUntil + durationSeconds * 1_000
  const routes = [
    ['home', '/api/home/cards'], ['home', '/api/home/cards'], ['home', '/api/home/cards'], ['home', '/api/home/cards'],
    ['miro', '/api/miro/cards'], ['miro', '/api/miro/cards'], ['miro', '/api/miro/cards'],
    ['search', `/api/home/search/cards?q=${label}`], ['search', `/api/home/search/cards?q=${label}`],
    ['searchMiss', `/api/home/search/cards?q=nevermatch${id.replaceAll('-', '')}`],
    ['popular', '/api/home/cards?sort=popular'],
  ]
  const workers = tokens.map(async (token, userIndex) => {
    let sequence = 0
    while (!stop.signal.aborted && performance.now() < endAt) {
      const [route, path] = routes[(userIndex + sequence) % routes.length]
      sequence++
      const offeredAt = performance.now()
      const timedOut = AbortSignal.timeout(timeoutMs)
      const signal = AbortSignal.any([timedOut, stop.signal])
      const measured = offeredAt >= warmUntil
      if (measured) {
        offered++
        offeredByRoute.set(route, offeredByRoute.get(route) + 1)
      }
      inflight++
      peakInflight = Math.max(peakInflight, inflight)
      let kind = 'ok'
      try {
        const response = await fetch(new URL(path, origin), { headers: { Cookie: `miro_session=${token}` }, signal, cache: 'no-store' })
        if (response.status === 429) kind = '429'
        else if (!response.ok) kind = 'error'
        else {
          const body = await response.json()
          const items = route === 'popular' ? body : body.items
          if (!Array.isArray(items)) kind = 'error'
          else if (route === 'searchMiss') kind = items.length === 0 ? 'expectedEmpty' : 'unexpectedNonEmpty'
          else if (items.length === 0) kind = 'empty'
        }
      } catch {
        kind = timedOut.aborted ? 'timeout' : 'error'
      } finally {
        inflight--
        if (measured && !stop.signal.aborted) {
          const sample = { route, kind, ms: performance.now() - offeredAt }
          samples.push(sample)
          groups.get(route).push(sample)
        }
      }
      if (thinkMs) await sleep(thinkMs, undefined, { signal: stop.signal }).catch(() => {})
    }
  })
  const monitor = (async () => {
    while (!stop.signal.aborted && performance.now() < endAt) {
      await sleep(1_000, undefined, { signal: stop.signal }).catch(() => {})
      if (stop.signal.aborted) break
      const disk = statfsSync(process.cwd())
      if (disk.bavail * disk.bsize < 2 * 1024 ** 3) stopReason = 'disk free below 2 GiB'
      const connections = Number(query("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()"))
      if (connections > maxDbConnections) stopReason = `DB connections ${connections} > ${maxDbConnections}`
      if (samples.length >= 100) {
        const current = summary(samples, Math.max(1, (performance.now() - warmUntil) / 1_000), offered, peakInflight)
        if (current.p95Ms > maxP95Ms) stopReason = `p95 ${current.p95Ms.toFixed(0)}ms > ${maxP95Ms}ms`
        if ((current.errors + current.rateLimited + current.timeouts + current.empty + current.unexpectedNonEmpty) / samples.length > 0.05) stopReason = 'non-success rate above 5%'
      }
      if (stopReason) stop.abort()
    }
  })()
  await Promise.all(workers)
  stop.abort()
  await monitor
  const elapsedSeconds = Math.max(0.001, (performance.now() - warmUntil) / 1_000)
  const result = {
    runId: id, characterCount: targetCharacters, virtualUsers: targetUsers, distinctTokens: tokens.length,
    model: 'closed-loop HTTP', warmupSeconds, requestedDurationSeconds: durationSeconds,
    measuredSeconds: elapsedSeconds, thinkMs, timeoutMs, origin: origin.origin,
    popularFirstRequest,
    stoppedEarly: Boolean(stopReason), stopReason,
    aggregate: summary(samples, elapsedSeconds, offered, peakInflight),
    routes: Object.fromEntries([...groups].map(([name, values]) => [name, summary(values, elapsedSeconds, offeredByRoute.get(name), peakInflight)])),
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (stopReason || result.aggregate.completed === 0) process.exitCode = 1
}

try {
  if (command === 'seed') seed()
  else if (command === 'run') await run()
  else if (command === 'cleanup') cleanup()
  else throw new Error('Usage: node tooling/perf-load.mjs <seed|run|cleanup> --run-id=<uuid> --characters=<10000|100000|1000000> --users=<100|500|1000>')
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
