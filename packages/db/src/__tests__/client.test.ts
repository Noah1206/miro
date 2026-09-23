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

  it('does not change local Postgres defaults', () => {
    expect(poolOptions('postgres://user:pass@localhost:5432/miro_test', '1')).toEqual({})
  })
})
