import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { canRetryVerification, verifyRetryAt } from '@miro/domain'
import { resolveAdultVerification } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { VerifyForm } from './form'

export default async function VerifyPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  const provider = resolveAdultVerification()
  const locked = !canRetryVerification(u?.adultVerifyFailedAt ?? null, new Date())
  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 60px', maxWidth: 520, margin: '0 auto' }}>
      <Link href="/my" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>
      <h1 style={{ fontSize: 20, margin: '18px 0 6px' }}>성인 인증</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 18px', lineHeight: 1.6 }}>성인 콘텐츠는 인증과 정책 동의를 완료한 경우에만 제공됩니다. 실존 인물 기반의 성적 표현은 인증 여부와 무관하게 제한됩니다.</p>
      {provider.info.notice && <p role="status" style={{ fontSize: 12, padding: '10px 12px', marginBottom: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--elevated)', color: 'var(--text-secondary)' }}>⚠ {provider.info.notice}</p>}
      {u?.adultVerifiedAt ? (
        <p data-verified style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, fontSize: 14 }}>인증 완료 · {u.adultVerifiedAt.toLocaleDateString('ko-KR')}</p>
      ) : locked ? (
        <p data-verify-locked role="alert" style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13.5, color: 'var(--accent-strong)' }}>
          인증에 실패했습니다. {verifyRetryAt(u!.adultVerifyFailedAt)!.toLocaleString('ko-KR')} 이후에 다시 시도할 수 있습니다.
        </p>
      ) : <VerifyForm />}
    </main>
  )
}
