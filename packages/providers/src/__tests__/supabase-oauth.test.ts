import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupabaseOAuthProvider } from '../auth/supabase'
import { resolveOAuth } from '../registry'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
const provider = () => new SupabaseOAuthProvider('google', 'https://project.supabase.co', 'sb_publishable_test')
const user = {
  id: '00000000-0000-4000-8000-000000000001', email: 'member@example.test', email_confirmed_at: '2026-09-14T00:00:00Z',
  identities: [{ provider: 'google', identity_data: { sub: 'google-account-id' } }], user_metadata: { name: 'Member' },
}
describe('Supabase social authentication', () => {
  it('routes through the project with PKCE and a distinct application state', () => {
    const url = new URL(provider().authorizeUrl({ redirectUri: 'http://localhost:3000/api/auth/google/callback', state: 'state-value', codeChallenge: 'challenge' }))
    expect(url.origin).toBe('https://project.supabase.co')
    expect(url.pathname).toBe('/auth/v1/authorize')
    expect(url.searchParams.get('code_challenge_method')).toBe('s256')
    expect(url.searchParams.get('provider')).toBe('google')
    expect(new URL(url.searchParams.get('redirect_to')!).searchParams.get('state')).toBe('state-value')
    expect(url.toString()).not.toContain('sb_publishable_test')
  })
  it('exchanges the code and verifies the user before creating an application profile', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'test-token' })).mockResolvedValueOnce(Response.json(user))
    const profile = await provider().exchange({ code: 'code', codeVerifier: 'verifier', redirectUri: 'http://localhost:3000' })
    expect(fetch.mock.calls[0]![0]).toBe('https://project.supabase.co/auth/v1/token?grant_type=pkce')
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body))).toEqual({ auth_code: 'code', code_verifier: 'verifier' })
    expect(fetch.mock.calls[1]![0]).toBe('https://project.supabase.co/auth/v1/user')
    expect(profile).toEqual({ provider: 'google', providerAccountId: 'google-account-id', email: 'member@example.test', name: 'Member' })
  })
  it('does not link an existing account using an unconfirmed email', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'test-token' })).mockResolvedValueOnce(Response.json({ ...user, email_confirmed_at: null }))
    expect((await provider().exchange({ code: 'c', codeVerifier: 'v', redirectUri: 'http://localhost' })).email).toBeNull()
  })
  it('rejects missing PKCE before making any request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    await expect(provider().exchange({ code: 'c', redirectUri: 'http://localhost' })).rejects.toThrow('verifier missing')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('rejects a profile without the requested social identity', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'test-token' })).mockResolvedValueOnce(Response.json({ ...user, identities: [] }))
    await expect(provider().exchange({ code: 'c', codeVerifier: 'v', redirectUri: 'http://localhost' })).rejects.toThrow('identity missing')
  })
  it('selects Supabase but preserves explicit E2E mock mode', () => {
    vi.stubEnv('AUTH_PROVIDER', 'supabase'); vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test'); vi.stubEnv('MIRO_MOCK_OAUTH', '0')
    expect(resolveOAuth('google')).toBeInstanceOf(SupabaseOAuthProvider)
    vi.stubEnv('MIRO_MOCK_OAUTH', '1'); vi.stubEnv('VERCEL_ENV', 'preview')
    expect(resolveOAuth('google').info.mode).toBe('mock')
  })
})
