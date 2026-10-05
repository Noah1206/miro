import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { db, userSettings } from '@miro/db'
import { consentRedirect } from '@/lib/consent-gate'
import { LANGUAGE_COOKIE } from '@/lib/i18n'
import { resolveOAuth } from '@miro/providers'
import { signInWithProfile } from '@/lib/auth'
import { isProvider, takeNext, takeOAuthState } from '@/lib/oauth-state'
import { track } from '@/lib/analytics/track'
import { observe } from '@/lib/observe'

/** n7 — 제공자에서 돌아옴. state 검증 → 코드 교환 → 세션 → 약관 또는 홈. */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  const url = new URL(req.url); const origin = process.env.AUTH_BASE_URL ?? url.origin
  const to = (path: string) => NextResponse.redirect(`${origin}${path}`, 302)
  if (!isProvider(provider)) return to('/login?error=failed')
  if (url.searchParams.get('error')) return to('/login?error=denied')

  const st = await takeOAuthState()
  const state = url.searchParams.get('state'), code = url.searchParams.get('code')
  if (!st || !code || st.provider !== provider || st.state !== state) { observe('auth.state_mismatch', { provider }); return to('/login?error=failed') }

  let profile
  try {
    profile = await resolveOAuth(provider).exchange({ code, redirectUri: `${origin}/api/auth/${provider}/callback`, codeVerifier: st.verifier })
  } catch (e) { observe('auth.exchange_failed', { provider, error: (e as Error).message }); return to('/login?error=failed') }

  const r = await signInWithProfile(profile)
  if (!r.ok) return to('/login?error=deleted')
  if (r.isNew) void track(r.userId, 'signup', { provider })

  // 계정에 고른 언어가 있으면 이 기기의 화면도 그 언어로 맞춘다(새 기기·쿠키를 지운 브라우저).
  const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, r.userId)).limit(1)
  if (settings) (await cookies()).set(LANGUAGE_COOKIE, settings.language, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 })
  // 온보딩(프로필·약관)이나 국외 이전 동의가 남아 있으면 그 화면이 먼저다 — 돌아갈 곳은 쿠키에 그대로 두고 동의 후에 쓴다.
  const pending = await consentRedirect(r.userId)
  if (pending) return to(pending)
  return to((await takeNext()) ?? '/home')
}
