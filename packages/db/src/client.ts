import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

type Db = ReturnType<typeof drizzle<typeof schema>>
/**
 * 프로세스에 풀 하나. 개발 서버는 라우트마다 이 모듈을 따로 올리고 고칠 때마다 다시 올린다 —
 * 모듈 변수에만 두면 풀이 그 수만큼 생겨 로컬 Postgres 의 연결 100개가 금방 찬다(9/26 데모에서 'too many clients').
 */
const shared = globalThis as { __miroDb?: Db }

/**
 * 첫 사용 시점에 연결한다. import 시점에 DATABASE_URL 을 요구하면
 * `next build` 의 페이지 데이터 수집이 DB 없이는 실패한다 — 빌드는 DB 를 몰라도 되어야 한다.
 */
function connect(): Db {
  if (shared.__miroDb) return shared.__miroDb
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  shared.__miroDb = drizzle(postgres(url, poolOptions(url)), { schema })
  return shared.__miroDb
}

/**
 * Supabase 는 두 가지 접속 경로를 준다. 어느 쪽인지는 호스트가 말해 준다.
 *  - Transaction Pooler (:6543, `pooler.supabase.com`) — 서버리스에 맞는 경로. 연결이 문장마다 바뀌므로
 *    prepared statement 를 쓸 수 없다. 켜 두면 "prepared statement already exists" 로 터진다.
 *  - Direct / Session (:5432) — 마이그레이션처럼 한 연결을 오래 쥐는 작업용.
 * 어느 쪽이든 TLS 는 필수다. 로컬 Postgres 는 이 모든 것에 해당하지 않으므로 건드리지 않는다.
 */
export function poolOptions(url: string, configuredMax = process.env.DB_POOL_MAX): postgres.Options<Record<string, never>> {
  const { hostname, port } = new URL(url)
  const supabase = hostname.endsWith('.supabase.com') || hostname.endsWith('.supabase.co')
  // 로컬: 쉬는 연결은 닫는다 — 기본값(영원히 유지)이면 개발 서버가 연결을 쥐고 놓지 않는다.
  if (!supabase) return { idle_timeout: 20 }
  const pooled = port === '6543' || hostname.includes('pooler')
  const max = configuredMax === undefined ? 5 : Number(configuredMax)
  if (!Number.isInteger(max) || max < 2 || max > 20) {
    throw new Error('DB_POOL_MAX must be an integer between 2 and 20')
  }
  return {
    ssl: 'require',
    // Transaction pooler 는 문장마다 연결이 바뀔 수 있어 named prepared statement 를 못 쓴다.
    prepare: !pooled,
    /**
     * 동시에 들어오는 요청 수만큼은 커넥션이 있어야 한다. 1 로 묶으면 한 요청이
     * 트랜잭션을 연 사이 다른 요청이 풀을 기다리다 타임아웃한다 — 트랜잭션 안에서
     * 커넥션을 하나 더 잡으려는 코드가 있으면 아예 자기 자신과 교착한다.
     * 인스턴스마다 별도 풀이 생기므로 최대 동시 인스턴스 수와 곱한 총 연결 수를
     * Supavisor 클라이언트 한도 및 DB 연결 여유 안에 둔다.
     */
    max,
    idle_timeout: 20,
    connect_timeout: 5,
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
