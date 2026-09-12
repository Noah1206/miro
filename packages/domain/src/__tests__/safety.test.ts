import { describe, expect, it } from 'vitest'
import { canRetryVerification, gateMature, purgeBefore, verifyRetryAt } from '../safety/mature'
import { POLICY } from '@miro/config'

describe('mature gate', () => {
  const ok = { adultVerifiedAt: new Date(), maturePolicyAgreedAt: new Date(), hasRealPersonReference: false }
  it('requires verification', () => {
    expect(gateMature({ ...ok, adultVerifiedAt: null })).toMatchObject({ allowed: false, reason: 'not_verified' })
  })
  it('requires policy agreement even when verified', () => {
    expect(gateMature({ ...ok, maturePolicyAgreedAt: null })).toMatchObject({ allowed: false, reason: 'policy_not_agreed' })
  })
  it('blocks real-person references regardless of verification', () => {
    const g = gateMature({ ...ok, hasRealPersonReference: true })
    expect(g).toMatchObject({ allowed: false, reason: 'real_person_reference' })
    expect((g as { next: string }).next).toMatch(/실존 인물/)
  })
  it('allows when everything is in place', () => {
    expect(gateMature(ok)).toEqual({ allowed: true })
  })
  it('every refusal names the next step', () => {
    for (const bad of [{ ...ok, adultVerifiedAt: null }, { ...ok, maturePolicyAgreedAt: null }, { ...ok, hasRealPersonReference: true }]) {
      const g = gateMature(bad); expect(g.allowed).toBe(false); expect((g as { next: string }).next.length).toBeGreaterThan(5)
    }
  })
})

describe('verification retry window', () => {
  const failed = new Date('2026-09-12T10:00:00Z')
  it('locks for the policy window after a failure', () => {
    expect(verifyRetryAt(failed)?.toISOString()).toBe(new Date(failed.getTime() + POLICY.adultVerification.retryAfterHours * 3600_000).toISOString())
    expect(canRetryVerification(failed, new Date('2026-09-12T20:00:00Z'))).toBe(false)
    expect(canRetryVerification(failed, new Date('2026-09-13T10:00:00Z'))).toBe(true)
  })
  it('never failed → can try', () => { expect(canRetryVerification(null, new Date())).toBe(true) })
})

describe('retention', () => {
  it('purge cutoff follows policy days', () => {
    const now = new Date('2026-10-12T00:00:00Z')
    expect(purgeBefore(now).getTime()).toBe(now.getTime() - POLICY.retention.deletedSessionDays * 86_400_000)
  })
})
