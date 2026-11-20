import { cookies } from 'next/headers'
import { setHomeUnveilFor } from '@/lib/home-mode'
import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { confirmAdult } from '@/lib/adult-verify'
import { confirmGuardian } from '@/lib/guardian'
import { afterSignup, withWelcome } from '@/lib/onboarding-options'

/**
 * 모바일 본인인증은 PortOne 창에서 이 주소로 돌아온다(함수 결과를 받지 못한다, 10/2).
 * 서버가 결과를 PortOne 에서 다시 받아 기록하고 인증 화면으로 보낸다 — 화면은 ?r 로 결과 한 줄을 보인다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const user = await currentUser()
  if (!user) return NextResponse.redirect(new URL('/login', url))
  const id = url.searchParams.get('identityVerificationId')
  // 11/20 만 14세 미만 가입의 보호자 동의 — 아이 계정의 성인 인증(confirmAdult)과 섞지 않는다.
  if (url.searchParams.get('next') === '/onboarding/guardian') {
    const ok = !!id && !url.searchParams.get('code') && (await confirmGuardian(user.id, { identityVerificationId: id })).ok
    return NextResponse.redirect(new URL(ok ? '/home' : `/onboarding/guardian?r=${id && !url.searchParams.get('code') ? 'failed' : 'cancelled'}`, url))
  }
  // code 가 있으면 사용자가 창을 닫았거나 본인확인기관 오류다 — 결과를 받으러 가지 않는다.
  const r = !id || url.searchParams.get('code') ? 'cancelled' : (await confirmAdult(user.id, { identityVerificationId: id })).ok ? 'done' : 'failed'
  const next = url.searchParams.get('next')
  // 11/4: 캐릭터 상세의 흐린 사진에서 시작한 인증도 언베일을 켜고 그 캐릭터로 돌아간다.
  const character = next && /^\/character\/([a-zA-Z0-9-]+)\?unveil=enable$/.exec(next)
  if (next === '/home?unveil=enable' || character) {
    const jar = await cookies()
    const intended = jar.get('miro_home_verify')?.value === user.id
    jar.delete('miro_home_verify')
    if (r === 'done' && intended) await setHomeUnveilFor(user.id, true, true)
    return NextResponse.redirect(new URL(character ? `/character/${character[1]}` : '/home', url))
  }
  // 가입 단계의 본인인증(11/8) — 끝났으면 보던 곳(없으면 홈), 아니면 그 단계로 결과와 함께.
  // 11/13 인증이 끝나면 로그인 전에 보던 곳(주소의 next, 없으면 홈)으로 — 홈으로만 보내면 보러 온 작품을 잃는다.
  if (next && (next === '/onboarding/verify' || next.startsWith('/onboarding/verify?'))) {
    const q = new URLSearchParams(next.split('?')[1] ?? '')
    const welcome = q.has('welcome'), dest = afterSignup(q.get('next'))
    const back = `/onboarding/verify?r=${r}${welcome ? '&welcome=1' : ''}&next=${encodeURIComponent(dest)}`
    return NextResponse.redirect(new URL(r === 'done' ? (welcome ? withWelcome(dest) : dest) : back, url))
  }
  // 채팅에서 시작한 인증은 해당 대화로 복귀한다. 외부 주소는 허용하지 않는다.
  if (next && /^\/chat\/[a-zA-Z0-9-]+$/.test(next)) return NextResponse.redirect(new URL(next, url))
  return NextResponse.redirect(new URL(`/my/verify?r=${r}`, url))
}
