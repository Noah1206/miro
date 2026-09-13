import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE = 'miro_oauth'
const NEXT = 'miro_next'
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
/**
 * 로그인 후 돌아갈 곳. 비로그인 상태로 보던 화면으로 되돌리기 위한 것이라
 * 앱 내부 경로만 받는다 — `//evil.com` 같은 값은 외부로 튕겨 보내는 통로가 된다.
 */
export async function rememberNext(path: string): Promise<void> {
  if (!path.startsWith('/') || path.startsWith('//')) return
  ;(await cookies()).set(NEXT, path, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 })
}
export async function takeNext(): Promise<string | null> {
  const jar = await cookies(); const v = jar.get(NEXT)?.value ?? null
  if (v) jar.delete(NEXT)
  return v && v.startsWith('/') && !v.startsWith('//') ? v : null
}

export function isProvider(p: string): p is 'google' | 'kakao' { return p === 'google' || p === 'kakao' }
