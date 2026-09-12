import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

type Db = ReturnType<typeof drizzle<typeof schema>>
let instance: Db | null = null

/**
 * 첫 사용 시점에 연결한다. import 시점에 DATABASE_URL 을 요구하면
 * `next build` 의 페이지 데이터 수집이 DB 없이는 실패한다 — 빌드는 DB 를 몰라도 되어야 한다.
 */
function connect(): Db {
  if (instance) return instance
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  instance = drizzle(postgres(url, options(url)), { schema })
  return instance
}

/**
 * Supabase 는 두 가지 접속 경로를 준다. 어느 쪽인지는 호스트가 말해 준다.
 *  - Transaction Pooler (:6543, `pooler.supabase.com`) — 서버리스에 맞는 경로. 연결이 문장마다 바뀌므로
 *    prepared statement 를 쓸 수 없다. 켜 두면 "prepared statement already exists" 로 터진다.
 *  - Direct / Session (:5432) — 마이그레이션처럼 한 연결을 오래 쥐는 작업용.
 * 어느 쪽이든 TLS 는 필수다. 로컬 Postgres 는 이 모든 것에 해당하지 않으므로 건드리지 않는다.
 */
function options(url: string): postgres.Options<Record<string, never>> {
  const { hostname, port } = new URL(url)
  const supabase = hostname.endsWith('.supabase.com') || hostname.endsWith('.supabase.co')
  if (!supabase) return {}
  const pooled = port === '6543' || hostname.includes('pooler')
  return {
    ssl: 'require',
    prepare: !pooled,
    // 서버리스 인스턴스가 각자 풀을 들고 있으면 Supabase 의 연결 한도를 금방 먹는다.
    max: pooled ? 1 : 10,
    idle_timeout: 20,
  }
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = connect() as unknown as Record<PropertyKey, unknown>
    const v = real[prop]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v
  },
})
export type { Db }
