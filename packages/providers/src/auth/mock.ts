import { mockProvidersAllowed } from '@miro/config'
import type { ProviderInfo } from '../types'
import type { OAuthProfile, OAuthProvider, OAuthProviderId } from './types'
import { OAUTH_LABEL } from './types'

/**
 * 제공자 키가 없을 때의 로그인 시뮬레이션.
 * 앱 안의 /auth/mock/[provider] 페이지가 동의 화면 역할을 하고, code 에 프로필을 담아 돌아온다.
 * 실제 인증이 아니라는 사실은 화면에 그대로 적는다.
 */
export class MockOAuthProvider implements OAuthProvider {
  readonly info: ProviderInfo
  readonly pkce = false
  constructor(readonly id: OAuthProviderId) {
    this.info = { mode: 'mock', name: `mock-oauth-${id}`, notice: `소셜 로그인 Provider 미구성 — ${OAUTH_LABEL[id]} 로그인을 개발용으로 시뮬레이션합니다.` }
  }
  authorizeUrl({ redirectUri, state }: { redirectUri: string; state: string }): string {
    return `/auth/mock/${this.id}?${new URLSearchParams({ state, redirect_uri: redirectUri })}`
  }
  async exchange({ code }: { code: string }): Promise<OAuthProfile> {
    if (!mockProvidersAllowed()) throw new Error('MOCK_AUTH_DISABLED')
    const json = Buffer.from(code, 'base64url').toString('utf8')
    const { email, name } = JSON.parse(json) as { email?: string; name?: string }
    if (!email) throw new Error('mock profile needs an email')
    return { provider: this.id, providerAccountId: `mock:${email.toLowerCase()}`, email: email.toLowerCase(), name: name ?? null }
  }
}
