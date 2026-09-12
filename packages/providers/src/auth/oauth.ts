import type { ProviderInfo } from '../types'
import type { OAuthProfile, OAuthProvider, OAuthProviderId } from './types'

type Endpoints = { authorize: string; token: string; profile: string; scope: string }
const ENDPOINTS: Record<OAuthProviderId, Endpoints> = {
  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', profile: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid email profile' },
  naver: { authorize: 'https://nid.naver.com/oauth2.0/authorize', token: 'https://nid.naver.com/oauth2.0/token', profile: 'https://openapi.naver.com/v1/nid/me', scope: '' },
  kakao: { authorize: 'https://kauth.kakao.com/oauth/authorize', token: 'https://kauth.kakao.com/oauth/token', profile: 'https://kapi.kakao.com/v2/user/me', scope: 'account_email profile_nickname' },
}

/**
 * 표준 Authorization Code 흐름. SDK 없이 fetch 만 쓴다.
 * 제공자 차이는 endpoint 와 프로필 파싱뿐이라 한 클래스로 충분하다.
 */
export class OAuth2Provider implements OAuthProvider {
  readonly info: ProviderInfo
  readonly pkce: boolean
  constructor(readonly id: OAuthProviderId, private readonly clientId: string, private readonly clientSecret: string) {
    this.info = { mode: 'live', name: `oauth-${id}`, notice: null }
    this.pkce = id !== 'naver'
  }
  authorizeUrl({ redirectUri, state, codeChallenge }: { redirectUri: string; state: string; codeChallenge?: string }): string {
    const e = ENDPOINTS[this.id]
    const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirectUri, response_type: 'code', state })
    if (e.scope) q.set('scope', e.scope)
    if (this.pkce && codeChallenge) { q.set('code_challenge', codeChallenge); q.set('code_challenge_method', 'S256') }
    return `${e.authorize}?${q}`
  }
  async exchange({ code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier?: string }): Promise<OAuthProfile> {
    const e = ENDPOINTS[this.id]
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: this.clientId, client_secret: this.clientSecret })
    if (this.pkce && codeVerifier) body.set('code_verifier', codeVerifier)
    const tokenRes = await fetch(e.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!tokenRes.ok) throw new Error(`${this.id} token exchange failed: ${tokenRes.status}`)
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    if (!access_token) throw new Error(`${this.id} token missing`)
    const profRes = await fetch(e.profile, { headers: { Authorization: `Bearer ${access_token}` } })
    if (!profRes.ok) throw new Error(`${this.id} profile failed: ${profRes.status}`)
    return parseProfile(this.id, await profRes.json())
  }
}

function parseProfile(id: OAuthProviderId, raw: unknown): OAuthProfile {
  const r = raw as Record<string, unknown>
  if (id === 'google') {
    return { provider: id, providerAccountId: String(r.sub), email: (r.email as string | undefined) ?? null, name: (r.name as string | undefined) ?? null }
  }
  if (id === 'naver') {
    const res = (r.response ?? {}) as Record<string, unknown>
    return { provider: id, providerAccountId: String(res.id), email: (res.email as string | undefined) ?? null, name: (res.nickname as string | undefined) ?? (res.name as string | undefined) ?? null }
  }
  const acc = (r.kakao_account ?? {}) as Record<string, unknown>
  const prof = (acc.profile ?? {}) as Record<string, unknown>
  return { provider: id, providerAccountId: String(r.id), email: (acc.email as string | undefined) ?? null, name: (prof.nickname as string | undefined) ?? null }
}
