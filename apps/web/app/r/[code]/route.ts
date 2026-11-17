import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { applyReferral, normalizeReferralCode, REF_COOKIE } from '@/lib/referral'

/**
 * 11/18 친구 초대 링크 miroapp.app/r/<추천인 코드> — 이벤트 페이지로 보낸다.
 * 로그인돼 있으면 바로 추천을 적용하고, 아니면 코드를 쿠키(30일)에 두었다가 로그인·가입 콜백이 적용한다.
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode(decodeURIComponent((await ctx.params).code))
  const origin = process.env.AUTH_BASE_URL ?? new URL(req.url).origin
  const landing = process.env.MIRO_INVITE_LANDING ?? '/e/ARCA1118'
  const res = NextResponse.redirect(`${origin}${landing}${code ? '?invited=1' : ''}`, 302)
  if (!code) return res
  const user = await currentUser()
  if (user) { await applyReferral(user.id, code).catch(() => null); return res }
  res.cookies.set(REF_COOKIE, code, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 30 * 86_400 })
  return res
}
