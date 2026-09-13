import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'miro_oauth'
export type OAuthState = { state: string; verifier: string; provider: string }

/** CSRF 상태 + PKCE 검증자를 httpOnly 쿠키에 10분간 보관한다. */
export async function beginOAuthState(provider: string): Promise<OAuthState & { challenge: string }> {
  const state = randomBytes(16).toString('hex'), verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  ;(await cookies()).set(COOKIE, JSON.stringify({ state, verifier, provider }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 })
  return { state, verifier, provider, challenge }
}
export async function takeOAuthState(): Promise<OAuthState | null> {
  const jar = await cookies(); const raw = jar.get(COOKIE)?.value
  jar.delete(COOKIE)
  try { return raw ? (JSON.parse(raw) as OAuthState) : null } catch { return null }
}
export function isProvider(p: string): p is 'google' | 'kakao' { return p === 'google' || p === 'kakao' }
