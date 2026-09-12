import { NextResponse } from 'next/server'
import { resolveOAuth } from '@miro/providers'
import { beginOAuthState, isProvider } from '@/lib/oauth-state'

/** n5/n6 — 소셜 로그인 시작. 제공자로 보낸다 (미구성이면 앱 안의 시뮬레이션 화면). */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  if (!isProvider(provider)) return NextResponse.json({ error: 'unknown provider' }, { status: 404 })
  const origin = new URL(req.url).origin
  const redirectUri = `${process.env.AUTH_BASE_URL ?? origin}/api/auth/${provider}/callback`
  const st = await beginOAuthState(provider)
  const p = resolveOAuth(provider)
  const url = p.authorizeUrl({ redirectUri, state: st.state, codeChallenge: p.pkce ? st.challenge : undefined })
  return NextResponse.redirect(url.startsWith('/') ? `${origin}${url}` : url, 302)
}
