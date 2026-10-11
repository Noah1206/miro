import { afterEach, describe, expect, it, vi } from 'vitest'
import { OAuth2Provider, parseProfile } from '../auth/oauth'

afterEach(() => vi.restoreAllMocks())

/** 10/3 점검: 인증 안 된 이메일은 넘기지 않는다 — 같은 이메일 계정에 자동 연결되므로. */
describe('OAuth profile email', () => {
  it('parses X user IDs without treating an unverified email as account-linking evidence', () => {
    expect(parseProfile('twitter', { data: { id: '123', name: 'Member', email: 'a@x.com' } })).toEqual({ provider: 'twitter', providerAccountId: '123', email: null, name: 'Member' })
    expect(() => parseProfile('twitter', { data: {} })).toThrow('identity missing')
  })
  it('uses confidential-client Basic authentication and PKCE for X code exchange', async () => {
    const p = new OAuth2Provider('twitter', 'client', 'secret')
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'token' })).mockResolvedValueOnce(Response.json({ data: { id: '123', name: 'Member' } }))
    const url = new URL(p.authorizeUrl({ redirectUri: 'https://miro.test/callback', state: 'state', codeChallenge: 'challenge' }))
    expect(url.origin).toBe('https://x.com')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    await expect(p.exchange({ code: 'code', redirectUri: 'https://miro.test/callback' })).rejects.toThrow('verifier missing')
    expect(fetch).not.toHaveBeenCalled()
    await p.exchange({ code: 'code', redirectUri: 'https://miro.test/callback', codeVerifier: 'verifier' })
    const init = fetch.mock.calls[0]![1]!
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('client:secret').toString('base64')}`)
    const body = new URLSearchParams(String(init.body))
    expect(body.get('code_verifier')).toBe('verifier')
    expect(body.has('client_secret')).toBe(false)
  })
  it('keeps only provider-verified emails', () => {
    expect(parseProfile('google', { sub: '1', email: 'a@x.com', email_verified: true }).email).toBe('a@x.com')
    expect(parseProfile('google', { sub: '1', email: 'a@x.com', email_verified: false }).email).toBeNull()
    expect(parseProfile('kakao', { id: 2, kakao_account: { email: 'b@x.com', is_email_valid: true, is_email_verified: true } }).email).toBe('b@x.com')
    expect(parseProfile('kakao', { id: 2, kakao_account: { email: 'b@x.com', is_email_valid: true, is_email_verified: false } }).email).toBeNull()
  })
})
