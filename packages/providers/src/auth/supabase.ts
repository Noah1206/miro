import { z } from 'zod'
import type { ProviderInfo } from '../types'
import type { OAuthProfile, OAuthProvider, OAuthProviderId } from './types'

const User = z.object({
  id: z.string().uuid(), email: z.string().email().optional(), email_confirmed_at: z.string().nullish(),
  identities: z.array(z.object({
    provider: z.string(), identity_data: z.object({ sub: z.union([z.string(), z.number()]) }).passthrough(),
  })),
  user_metadata: z.object({ full_name: z.string().optional(), name: z.string().optional() }).passthrough().optional(),
})

/** Supabase handles the upstream social provider; Miro retains its application session. */
export class SupabaseOAuthProvider implements OAuthProvider {
  readonly pkce = true
  readonly info: ProviderInfo
  private readonly url: string

  constructor(readonly id: OAuthProviderId, url: string, private readonly key: string) {
    this.url = url.replace(/\/$/, '')
    this.info = { mode: 'live', name: `supabase-${id}`, notice: null }
  }

  authorizeUrl({ redirectUri, state, codeChallenge }: { redirectUri: string; state: string; codeChallenge?: string }): string {
    if (!this.key || !codeChallenge) throw new Error('Supabase Auth configuration missing')
    // Supabase owns upstream OAuth state. Our separate state returns in the allowlisted callback URL.
    const callback = new URL(redirectUri)
    callback.searchParams.set('state', state)
    const authorize = new URL(`${this.url}/auth/v1/authorize`)
    authorize.search = new URLSearchParams({ provider: this.id, redirect_to: callback.toString(),
      code_challenge: codeChallenge, code_challenge_method: 's256' }).toString()
    return authorize.toString()
  }

  async exchange({ code, codeVerifier }: { code: string; redirectUri: string; codeVerifier?: string }): Promise<OAuthProfile> {
    if (!this.key || !codeVerifier) throw new Error('Supabase PKCE verifier missing')
    const token = await fetch(`${this.url}/auth/v1/token?grant_type=pkce`, {
      method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }), signal: AbortSignal.timeout(15_000),
    })
    if (!token.ok) throw new Error(`Supabase code exchange failed: ${token.status}`)
    const session = z.object({ access_token: z.string().min(1) }).parse(await token.json())
    // Validate with Auth; never trust browser metadata or the callback's claimed identity.
    const response = await fetch(`${this.url}/auth/v1/user`, {
      headers: { apikey: this.key, Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`Supabase user verification failed: ${response.status}`)
    const user = User.parse(await response.json())
    const identity = user.identities.find(i => i.provider === this.id)
    if (!identity || !String(identity.identity_data.sub)) throw new Error('Supabase provider identity missing')
    return { provider: this.id, providerAccountId: String(identity.identity_data.sub),
      // Existing account linking uses email: only supply an Auth-confirmed address.
      email: user.email_confirmed_at ? user.email ?? null : null,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null }
  }
}
