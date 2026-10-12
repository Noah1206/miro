import { beforeEach, describe, expect, it, vi } from 'vitest'
const cookie = vi.hoisted(() => ({ raw: '', set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookie.raw ? { value: cookie.raw } : undefined, set: cookie.set }) }))
vi.mock('@/lib/legal', () => ({ termsVersion: () => 'terms-current', privacyVersion: () => 'privacy-current' }))
import { visitorConsent, VISITOR_REQUIRED } from '../visitor-consent'
import { acceptVisitorConsent } from '../../app/visitor-consent-actions'
const receipt = () => ({ version: 1, terms: 'terms-current', privacy: 'privacy-current', at: new Date().toISOString(), marketing: false, nightMarketing: false })
beforeEach(() => { cookie.raw = ''; cookie.set.mockReset() })
describe('first-visit consent', () => {
  it('does not record missing required agreement', async () => {
    const form = new FormData()
    for (const key of VISITOR_REQUIRED) if (key !== 'transfer') form.set(key, 'on')
    expect(await acceptVisitorConsent(form)).toBe(false)
    expect(cookie.set).not.toHaveBeenCalled()
  })
  it('accepts required-only agreement without opting into marketing', async () => {
    const form = new FormData()
    for (const key of VISITOR_REQUIRED) form.set(key, 'on')
    expect(await acceptVisitorConsent(form)).toBe(true)
    const [, value, options] = cookie.set.mock.calls[0]!
    expect(JSON.parse(value)).toMatchObject({ marketing: false, nightMarketing: false, terms: 'terms-current' })
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })
    cookie.raw = value
    expect(await visitorConsent()).not.toBeNull()
  })
  it('requires consent again for stale versions, expired receipts and malformed data', async () => {
    for (const value of [{ ...receipt(), terms: 'old' }, { ...receipt(), at: new Date(Date.now() - 31 * 86400000).toISOString() }, { ...receipt(), at: 'bad' }, { ...receipt(), marketing: 'true' }]) {
      cookie.raw = JSON.stringify(value)
      expect(await visitorConsent()).toBeNull()
    }
    cookie.raw = 'broken'
    expect(await visitorConsent()).toBeNull()
  })
})
