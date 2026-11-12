import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { consentRedirect } from '@/lib/consent-gate'

/**
 * 앱 최초 실행(n1) → 언제나 Home.
 * 로그인은 입장할 때 요구한다 — 먼저 무엇이 있는지 보여주고 나서 묻는다 (E-48).
 * 받지 않은 동의(온보딩·국외 이전)가 있으면 그 화면이 먼저다.
 * 11/12: 홍보 링크의 utm_source 는 홈까지 들고 간다(채널별 유입 집계).
 */
export default async function Root({ searchParams }: { searchParams: Promise<{ utm_source?: string }> }) {
  const user = await currentUser()
  if (user) {
    const to = await consentRedirect(user.id)
    if (to) redirect(to)
  }
  const src = (await searchParams).utm_source
  redirect(typeof src === 'string' && src ? `/home?utm_source=${encodeURIComponent(src)}` : '/home')
}
