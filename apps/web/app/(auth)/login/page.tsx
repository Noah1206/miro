import { redirect } from 'next/navigation'

/** 기존 로그인 링크도 홈의 로그인 시트로 연결한다. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams
  const query = new URLSearchParams({ login: '1' })
  if (error) query.set('error', error)
  if (next?.startsWith('/') && !next.startsWith('//')) query.set('next', next)
  redirect(`/home?${query}`)
}
