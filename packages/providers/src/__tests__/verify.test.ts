import { afterEach, describe, expect, it, vi } from 'vitest'
import { adultOn } from '../verify/types'
import { PortOneAdultVerificationProvider } from '../verify/portone'

/** 성인 인증(10/2): 청소년 보호법 기준(19세가 되는 해의 1월 1일부터)으로 보고, PortOne 결과는 서버가 다시 받는다 — 미성년만 잠그고 창 닫기·장애는 잠그지 않는다. */
describe('adult by the Youth Protection Act', () => {
  it('counts from January 1 of the year one turns 19, in Korean dates — the birthday does not matter', () => {
    expect(adultOn('2007-12-06', new Date('2026-10-02T03:00:00Z'), 19)).toBe(true)    // 생일 전이지만 19세가 되는 해
    expect(adultOn('2008-01-01', new Date('2026-12-31T14:59:00Z'), 19)).toBe(false)   // KST 2026-12-31 23:59
    expect(adultOn('2008-01-01', new Date('2026-12-31T15:00:00Z'), 19)).toBe(true)    // KST 2027-01-01 00:00
    expect(adultOn('1990-01-01', new Date('2026-10-02T00:00:00Z'), 19)).toBe(true)
    expect(adultOn('2026/01/01', new Date('2026-10-02T00:00:00Z'), 19)).toBeNull()
  })
})

describe('PortOne identity verification', () => {
  afterEach(() => vi.restoreAllMocks())
  const provider = () => new PortOneAdultVerificationProvider('secret', 'store-1', 'channel-1')
  const answer = (body: unknown, status = 200) => vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))

  it('asks PortOne itself with the API secret and accepts a verified adult', async () => {
    const spy = answer({ status: 'VERIFIED', verifiedCustomer: { birthDate: '1990-05-01' } })
    expect(await provider().verify({ userId: 'u', identityVerificationId: 'iv-u-1' })).toEqual({ verified: true })
    expect(String(spy.mock.calls[0]![0])).toBe('https://api.portone.io/identity-verifications/iv-u-1')
    expect(new Headers(spy.mock.calls[0]![1]!.headers).get('Authorization')).toBe('PortOne secret')
  })

  it('locks only a verified minor; a closed window or an outage stays retryable', async () => {
    answer({ status: 'VERIFIED', verifiedCustomer: { birthDate: '2015-01-01' } })
    expect(await provider().verify({ userId: 'u', identityVerificationId: 'a' })).toMatchObject({ verified: false, lock: true })
    answer({ status: 'READY' })
    expect(await provider().verify({ userId: 'u', identityVerificationId: 'b' })).toMatchObject({ verified: false, lock: false })
    answer({ message: 'down' }, 503)
    expect(await provider().verify({ userId: 'u', identityVerificationId: 'c' })).toMatchObject({ verified: false, lock: false })
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network'))
    expect(await provider().verify({ userId: 'u', identityVerificationId: 'd' })).toMatchObject({ verified: false, lock: false })
    expect(await provider().verify({ userId: 'u' })).toMatchObject({ verified: false, lock: false })
  })
})
