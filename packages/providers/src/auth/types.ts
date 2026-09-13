import type { ProviderInfo } from '../types'

export type OAuthProviderId = 'google' | 'kakao'
export const OAUTH_PROVIDERS: OAuthProviderId[] = ['google', 'kakao']

export type OAuthProfile = {
  provider: OAuthProviderId
  providerAccountId: string
  email: string | null
  name: string | null
}

export interface OAuthProvider {
  readonly id: OAuthProviderId
  readonly info: ProviderInfo
  /** PKCE 지원 여부. 지원하면 code_challenge 를 보낸다. */
  readonly pkce: boolean
  authorizeUrl(p: { redirectUri: string; state: string; codeChallenge?: string }): string
  exchange(p: { code: string; redirectUri: string; codeVerifier?: string }): Promise<OAuthProfile>
}

export const OAUTH_LABEL: Record<OAuthProviderId, string> = { google: 'Google', kakao: '카카오' }
