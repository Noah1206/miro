import { afterEach, describe, expect, it, vi } from 'vitest'
import { poolOptions } from '../client'

const pooler = 'postgres://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

describe('database pool options', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses a bounded pool and disables prepare on the transaction pooler', () => {
    vi.stubEnv('DB_POOL_MAX', undefined)
    expect(poolOptions(pooler, undefined)).toMatchObject({
      max: 5, prepare: false, ssl: 'require', connect_timeout: 5, idle_timeout: 20,
    })
    expect(poolOptions(pooler, '12').max).toBe(12)
    expect(poolOptions('postgres://user:pass@db.example.supabase.co:5432/postgres', '4').prepare).toBe(true)
  })

  it.each(['0', '1', '21', 'NaN', 'Infinity', '2.5', ''])('rejects invalid DB_POOL_MAX %s', value => {
    expect(() => poolOptions(pooler, value)).toThrow('DB_POOL_MAX')
  })

  it('leaves local pool size and TLS alone, only closing idle connections', () => {
    // 로컬은 풀 크기·TLS 를 건드리지 않고, 쉬는 연결만 닫는다(개발 서버가 연결을 쥐고 놓지 않던 문제).
    expect(poolOptions('postgres://user:pass@localhost:5432/miro_test', '1')).toEqual({ idle_timeout: 20 })
  })
})
