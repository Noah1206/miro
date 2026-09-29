import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { canRetryVerification, verifyRetryAt } from '@miro/domain'
import { resolveAdultVerification } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { Notice, Page, PageHeader } from '@/components/ui'
import { VerifyForm } from './form'
import { INTL_LOCALE } from '@/lib/i18n'
import { getLanguage, getT } from '@/lib/i18n/server'

export default async function VerifyPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  const provider = resolveAdultVerification()
  const locked = !canRetryVerification(u?.adultVerifyFailedAt ?? null, new Date())
  const [t, language] = await Promise.all([getT(), getLanguage()])
  const locale = INTL_LOCALE[language]
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader back="/my" title={t('성인 인증')} lead={t('성인 표현은 인증과 정책 동의를 마친 경우에만. 실존 인물 기반의 성적 표현은 인증과 무관하게 제한됩니다.')} />
      {provider.info.notice && <Notice style={{ marginBottom: 14 }}>⚠ {provider.info.notice}</Notice>}
      {u?.adultVerifiedAt ? <p data-verified className="t-body" style={{ padding: 16, background: 'var(--color-surface-1)', border: '1px solid var(--color-white)', borderRadius: 'var(--radius-md)' }}>{t('인증 완료 · {date}', { date: u.adultVerifiedAt.toLocaleDateString(locale) })}</p>
        : locked ? <p data-verify-locked role="alert" className="t-body" style={{ padding: 16, background: 'var(--color-surface-1)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)' }}>{t('인증에 실패했습니다. {at} 이후에 다시 시도할 수 있습니다.', { at: verifyRetryAt(u!.adultVerifyFailedAt)!.toLocaleString(locale) })}</p>
        : <VerifyForm />}
    </Page>
  )
}
