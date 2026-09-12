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
  instance = drizzle(postgres(url), { schema })
  return instance
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = connect() as unknown as Record<PropertyKey, unknown>
    const v = real[prop]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v
  },
})
export type { Db }
