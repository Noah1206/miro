import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { confirmAdult } from '@/lib/adult-verify'

/**
 * 모바일 본인인증은 PortOne 창에서 이 주소로 돌아온다(함수 결과를 받지 못한다, 10/2).
 * 서버가 결과를 PortOne 에서 다시 받아 기록하고 인증 화면으로 보낸다 — 화면은 ?r 로 결과 한 줄을 보인다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const user = await currentUser()
  if (!user) return NextResponse.redirect(new URL('/login', url))
  const id = url.searchParams.get('identityVerificationId')
  // code 가 있으면 사용자가 창을 닫았거나 본인확인기관 오류다 — 결과를 받으러 가지 않는다.
  const r = !id || url.searchParams.get('code') ? 'cancelled' : (await confirmAdult(user.id, { identityVerificationId: id })).ok ? 'done' : 'failed'
  return NextResponse.redirect(new URL(`/my/verify?r=${r}`, url))
}
