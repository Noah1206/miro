import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'

if (process.env.MIRO_ALLOW_INDEX_BACKFILL !== '1') throw new Error('Set MIRO_ALLOW_INDEX_BACKFILL=1 for an explicit backfill')
if (process.env.MIRO_FEATURE_INDEXED_DISCOVERY === '1') throw new Error('Keep indexed discovery disabled until validation finishes')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const batchSize = Number(process.env.MIRO_BACKFILL_BATCH_SIZE ?? 100)
const pauseMs = Number(process.env.MIRO_BACKFILL_PAUSE_MS ?? 25)
const afterId = process.env.MIRO_BACKFILL_AFTER_ID ?? '00000000-0000-0000-0000-000000000000'
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw new Error('MIRO_BACKFILL_BATCH_SIZE must be 1..500')
if (!Number.isInteger(pauseMs) || pauseMs < 0 || pauseMs > 1000) throw new Error('MIRO_BACKFILL_PAUSE_MS must be 0..1000')
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(afterId)) throw new Error('Invalid MIRO_BACKFILL_AFTER_ID')

const requireDb = createRequire(new URL('../packages/db/package.json', import.meta.url))
const postgres = requireDb('postgres')
const hostname = new URL(process.env.DATABASE_URL).hostname
const supabase = hostname.endsWith('.supabase.com') || hostname.endsWith('.supabase.co')
const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  connect_timeout: 5,
  ...(supabase ? { ssl: 'require' } : {}),
})

let cursor = afterId
let processed = 0
try {
  const [available] = await client`SELECT to_regprocedure('miro_perf.backfill_character(uuid)') IS NOT NULL AS available`
  if (!available?.available) throw new Error('Run the schema-only migration first')
  for (;;) {
    let rows
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        rows = await client.begin(async transaction => {
          await transaction`SET LOCAL statement_timeout = '20s'`
          await transaction`SET LOCAL lock_timeout = '3s'`
          return transaction`
            WITH batch AS MATERIALIZED (
              SELECT id FROM public.characters
              WHERE id > ${cursor}::uuid ORDER BY id LIMIT ${batchSize}
            )
            SELECT batch.id, miro_perf.backfill_character(batch.id)
            FROM batch ORDER BY batch.id
          `
        })
        break
      } catch (error) {
        if (attempt === 3 || !['40P01', '55P03', '40001', '23503'].includes(error.code)) throw error
        await sleep(attempt * 250)
      }
    }
    if (!rows?.length) break
    cursor = rows.at(-1).id
    processed += rows.length
    console.log(JSON.stringify({ processed, cursor }))
    if (pauseMs) await sleep(pauseMs)
  }
  console.log(JSON.stringify({ complete: true, processed, cursor }))
} finally {
  await client.end()
}
