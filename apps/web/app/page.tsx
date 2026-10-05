import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { consentRedirect } from '@/lib/consent-gate'

/**
 * 앱 최초 실행(n1) → 언제나 Home.
 * 로그인은 입장할 때 요구한다 — 먼저 무엇이 있는지 보여주고 나서 묻는다 (E-48).
 * 받지 않은 동의(온보딩·국외 이전)가 있으면 그 화면이 먼저다.
 */
export default async function Root() {
  const user = await currentUser()
  if (user) {
    const to = await consentRedirect(user.id)
    if (to) redirect(to)
  }
  redirect('/home')
}
