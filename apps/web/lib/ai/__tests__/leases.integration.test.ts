import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { db } from '@miro/db'
import { testDatabaseUrl } from '../../../../../tooling/test-database'
import { databaseAILeaseGuard } from '../gateway'
import { installAIUsageSink } from '../../usage/ai-usage'
import { createAI } from '@miro/providers'

type WorkerMessage = { type: 'started' } | { type: 'result'; value?: string; attempts?: number; last?: string }
const workers: ChildProcess[] = []
afterEach(async () => {
  for (const worker of workers) worker.send('release')
  for (let attempt = 0; attempt < 100 && await leaseCount(); attempt++) await new Promise(resolve => setTimeout(resolve, 20))
  for (const worker of workers.splice(0)) worker.kill()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function startWorker(provider: string, limits: { global: number; provider: number }, timeout = 5000, database = process.env.DATABASE_URL!, cancel = false, maxHold = 300_000) {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./lease-worker.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    env: { ...process.env, DATABASE_URL: database, MIRO_AI_GLOBAL_CONCURRENCY: String(limits.global),
      MIRO_AI_PROVIDER_CONCURRENCY: String(limits.provider), LEASE_TEST_PROVIDER: provider,
      LEASE_TEST_TIMEOUT: String(timeout), LEASE_TEST_USER: randomUUID(), LEASE_TEST_SESSION: randomUUID(),
      LEASE_TEST_CANCEL: cancel ? '1' : '0', LEASE_TEST_MAX_HOLD: String(maxHold) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  workers.push(child)
  let stderr = ''
  child.stderr?.on('data', chunk => { stderr += String(chunk) })
  const queued: WorkerMessage[] = []
  const waiters: Array<{ type: WorkerMessage['type']; resolve: (message: WorkerMessage) => void }> = []
  child.on('message', (message: WorkerMessage) => {
    const index = waiters.findIndex(waiter => waiter.type === message.type)
    if (index < 0) queued.push(message)
    else waiters.splice(index, 1)[0]!.resolve(message)
  })
  return {
    child,
    next: (type: WorkerMessage['type']) => new Promise<WorkerMessage>((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error(`worker ${type} timed out: ${stderr}`)), 10_000)
        const done = (message: WorkerMessage) => { clearTimeout(timeoutId); resolve(message) }
        const index = queued.findIndex(message => message.type === type)
        if (index < 0) waiters.push({ type, resolve: done })
        else done(queued.splice(index, 1)[0]!)
      }),
  }
}

async function leaseCount() {
  const [row] = await db.execute<{ count: number }>(sql`SELECT count(*)::int AS count FROM ai_provider_leases WHERE lease_until > now()`)
  return row!.count
}

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
describeDb('cross-process AI leases', () => {
  beforeAll(async () => {
    testDatabaseUrl(process.env.DATABASE_URL)
    await db.execute(sql`DELETE FROM ai_provider_leases WHERE provider LIKE 'fake-%'`)
  })
  it('leaves DB leases disabled for development mock calls unless explicitly enabled', async () => {
    vi.stubEnv('MIRO_AI_DB_LEASES', '0')
    vi.stubEnv('AI_PROVIDER', '')
    vi.stubEnv('AI_FALLBACK_PROVIDER', '')
    vi.stubEnv('MIRO_MODEL_REGISTRY', '')
    const acquire = vi.spyOn(databaseAILeaseGuard, 'acquire')
    installAIUsageSink()
    await expect(createAI({ mock: () => 'ok' }).generateText({ system: '', prompt: '' })).resolves.toBe('ok')
    expect(acquire).not.toHaveBeenCalled()
  })
  it('limits one provider across distinct runtime instances and users', async () => {
    const first = startWorker('fake-provider-cap', { global: 2, provider: 1 })
    await first.next('started')
    const second = startWorker('fake-provider-cap', { global: 2, provider: 1 })
    expect(await second.next('result')).toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    expect(await leaseCount()).toBe(1)
    first.child.send('release')
    expect(await first.next('result')).toMatchObject({ value: 'ok' })
  }, 20_000)

  it('rejects advisory-lock contention without waiting for the holder', async () => {
    let locked!: () => void
    let release!: () => void
    const entered = new Promise<void>(resolve => { locked = resolve })
    const blocked = new Promise<void>(resolve => { release = resolve })
    const holder = db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('miro:ai-provider-leases'))`)
      locked()
      await blocked
    })
    try {
      await entered
      const started = Date.now()
      expect(await databaseAILeaseGuard.acquire('fake-lock-contention', 'interactive')).toBeNull()
      expect(Date.now() - started).toBeLessThan(1000)
    } finally { release(); await holder }
  })

  it('bounds admission when all database connections are queued', async () => {
    let release!: () => void
    let allReady!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const ready = new Promise<void>(resolve => { allReady = resolve })
    let count = 0
    const holders = Array.from({ length: 10 }, () => db.transaction(async tx => {
      await tx.execute(sql`SELECT 1`)
      if (++count === 10) allReady()
      await blocked
    }))
    try {
      await ready
      const started = Date.now()
      await expect(databaseAILeaseGuard.acquire('fake-pool-queue', 'interactive')).rejects.toThrow('lease_admission_timeout')
      expect(Date.now() - started).toBeLessThan(2500)
    } finally { release(); await Promise.all(holders) }
    expect(await leaseCount()).toBe(0)
  }, 15_000)

  it('limits total calls across different providers and runtime instances', async () => {
    const first = startWorker('fake-global-a', { global: 1, provider: 2 })
    await first.next('started')
    const second = startWorker('fake-global-b', { global: 1, provider: 2 })
    expect(await second.next('result')).toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    first.child.send('release')
    expect(await first.next('result')).toMatchObject({ value: 'ok' })
  }, 20_000)

  it('retains a lease after timeout while an abort-ignoring provider remains active', async () => {
    const first = startWorker('fake-ignores-abort', { global: 2, provider: 1 }, 50)
    await first.next('started')
    expect(await first.next('result')).toMatchObject({ attempts: 1, last: 'timeout 50ms' })
    const second = startWorker('fake-ignores-abort', { global: 2, provider: 1 })
    expect(await second.next('result')).toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    first.child.send('release')
  }, 20_000)

  it('releases a bounded lease even when an abort-ignoring physical call never settles', async () => {
    const first = startWorker('fake-max-hold', { global: 2, provider: 1 }, 50, process.env.DATABASE_URL!, false, 800)
    await first.next('started')
    expect(await first.next('result')).toMatchObject({ attempts: 1, last: 'timeout 50ms' })
    const blocked = startWorker('fake-max-hold', { global: 2, provider: 1 })
    expect(await blocked.next('result')).toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    for (let attempt = 0; attempt < 100 && await leaseCount(); attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    expect(await leaseCount()).toBe(0)
    const overlapping = startWorker('fake-max-hold', { global: 2, provider: 1 })
    await overlapping.next('started')
    expect(first.child.killed).toBe(false)
    first.child.send('release')
    overlapping.child.send('release')
    expect(await overlapping.next('result')).toMatchObject({ value: 'ok' })
  }, 20_000)

  it('retains a lease after caller cancellation until physical work settles', async () => {
    const first = startWorker('fake-cancel', { global: 2, provider: 1 }, 5000, process.env.DATABASE_URL!, true)
    await first.next('started')
    first.child.send('cancel')
    expect(await first.next('result')).toMatchObject({ attempts: 1, last: 'cancelled' })
    const second = startWorker('fake-cancel', { global: 2, provider: 1 })
    expect(await second.next('result')).toMatchObject({ attempts: 0, last: 'provider_overloaded' })
    first.child.send('release')
  }, 20_000)

  it('fails closed when the lease database is unavailable', async () => {
    const worker = startWorker('fake-outage', { global: 2, provider: 1 }, 5000, 'postgres://localhost:1/miro_test')
    expect(await worker.next('result')).toMatchObject({ attempts: 0, last: 'lease_store_unavailable' })
  }, 20_000)

  it('renews only a live lease and releases only its ownership token', async () => {
    vi.stubEnv('MIRO_AI_GLOBAL_CONCURRENCY', '2')
    vi.stubEnv('MIRO_AI_PROVIDER_CONCURRENCY', '1')
    const first = await databaseAILeaseGuard.acquire('fake-token', 'interactive')
    expect(first).not.toBeNull()
    try {
      await db.execute(sql`UPDATE ai_provider_leases SET lease_until = now() + interval '1 second' WHERE provider = 'fake-token'`)
      expect(await first!.heartbeat()).toBe(true)
      const [renewed] = await db.execute<{ renewed: boolean }>(sql`SELECT lease_until > now() + interval '20 seconds' AS renewed
        FROM ai_provider_leases WHERE provider = 'fake-token'`)
      expect(renewed?.renewed).toBe(true)
      expect(await databaseAILeaseGuard.acquire('fake-token', 'interactive')).toBeNull()
      await db.execute(sql`UPDATE ai_provider_leases SET lease_until = now() - interval '1 second' WHERE provider = 'fake-token'`)
      expect(await first!.heartbeat()).toBe(false)
      const second = await databaseAILeaseGuard.acquire('fake-token', 'interactive')
      expect(second).not.toBeNull()
      await first!.release()
      expect(await leaseCount()).toBe(1)
      await second!.release()
    } finally { await first!.release() }
  })

  it('keeps lease rows inaccessible to public API roles', async () => {
    const [security] = await db.execute<{ enabled: boolean; allowed: boolean }>(sql`SELECT relrowsecurity AS enabled,
      EXISTS (SELECT 1 FROM (VALUES ('anon'), ('authenticated')) roles(name)
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) permissions(name)
        WHERE has_table_privilege(roles.name, 'ai_provider_leases', permissions.name)) AS allowed
      FROM pg_class WHERE oid = 'ai_provider_leases'::regclass`)
    expect(security).toEqual({ enabled: true, allowed: false })
  })
})
