import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, termsConsents } from '@miro/db'
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

  const consent = await db.select({ id: termsConsents.id }).from(termsConsents).where(eq(termsConsents.userId, r.userId)).limit(1)
  // 동의가 남아 있으면 그 화면이 먼저다 — 돌아갈 곳은 쿠키에 그대로 두고 동의 후에 쓴다.
  if (consent.length === 0) return to('/terms')
  return to((await takeNext()) ?? '/home')
}
