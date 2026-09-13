import { NextResponse } from 'next/server'
import { resolveOAuth } from '@miro/providers'
import { beginOAuthState, isProvider, rememberNext } from '@/lib/oauth-state'

/** n5/n6 — 소셜 로그인 시작. 제공자로 보낸다 (미구성이면 앱 안의 시뮬레이션 화면). */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!isProvider(provider)) return NextResponse.json({ error: 'unknown provider' }, { status: 404 })
  const incoming = new URL(req.url)
  const origin = incoming.origin
  // 로그인 뒤 돌아갈 곳. 쿠키 쓰기는 Route Handler 에서만 허용된다 (서버 컴포넌트에서는 불가).
  const next = incoming.searchParams.get('next')
  if (next) await rememberNext(next)

  const redirectUri = `${process.env.AUTH_BASE_URL ?? origin}/api/auth/${provider}/callback`
  const st = await beginOAuthState(provider)
  const p = resolveOAuth(provider)
  const authorize = p.authorizeUrl({ redirectUri, state: st.state, codeChallenge: p.pkce ? st.challenge : undefined })
  return NextResponse.redirect(authorize.startsWith('/') ? `${origin}${authorize}` : authorize, 302)
}
