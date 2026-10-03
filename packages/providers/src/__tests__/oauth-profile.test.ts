import { describe, expect, it } from 'vitest'
import { parseProfile } from '../auth/oauth'

/** 10/3 점검: 인증 안 된 이메일은 넘기지 않는다 — 같은 이메일 계정에 자동 연결되므로. */
describe('OAuth profile email', () => {
  it('keeps only provider-verified emails', () => {
    expect(parseProfile('google', { sub: '1', email: 'a@x.com', email_verified: true }).email).toBe('a@x.com')
    expect(parseProfile('google', { sub: '1', email: 'a@x.com', email_verified: false }).email).toBeNull()
    expect(parseProfile('kakao', { id: 2, kakao_account: { email: 'b@x.com', is_email_valid: true, is_email_verified: true } }).email).toBe('b@x.com')
    expect(parseProfile('kakao', { id: 2, kakao_account: { email: 'b@x.com', is_email_valid: true, is_email_verified: false } }).email).toBeNull()
  })
})
