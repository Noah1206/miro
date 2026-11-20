import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'
import { resolveAdultVerification } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { consentRedirect } from '@/lib/consent-gate'
import { verificationPrefix } from '@/lib/adult-verify'
import { Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { logout } from '@/app/(main)/my/actions'
import { GuardianVerify } from './verify'

/** 11/20 만 14세 미만 가입 — 보호자(법정대리인) 휴대전화 본인인증으로 동의를 받는 단계. 마치기 전에는 다른 화면으로 가지 못한다(consent-gate). */
export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const pending = await consentRedirect(user.id)
  if (pending !== '/onboarding/guardian') redirect(pending ?? '/home')
  const [[u], t, { r }] = await Promise.all([db.select({ name: users.displayName }).from(users).where(eq(users.id, user.id)).limit(1), getT(), searchParams])
  const provider = resolveAdultVerification()
  return (
    <Page style={{ maxWidth: 480, minHeight: '100dvh', display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 'calc(48px + env(safe-area-inset-top))' }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.35 }}>{t('보호자 동의가 필요해요')}</h1>
      <p className="t-body" style={{ margin: 0, color: 'var(--color-text-secondary)', wordBreak: 'keep-all' }}>
        {t('만 14세 미만은 보호자(부모님 등)의 동의가 있어야 미로를 쓸 수 있어요. 보호자가 이 화면에서 본인 휴대전화로 본인인증을 하면 바로 시작할 수 있어요.')}
      </p>
      <ul className="t-caption" style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text-secondary)', lineHeight: 1.7, wordBreak: 'keep-all' }}>
        <li>{t('{name} 님의 계정에 보호자가 동의한다는 확인이에요.', { name: u?.name || t('회원') })}</li>
        <li>{t('보호자의 이름·전화번호·생년월일은 저장하지 않고, 동의한 시각만 남겨요.')}</li>
        <li>{t('성인 콘텐츠(언베일)는 동의와 상관없이 이용할 수 없어요.')}</li>
      </ul>
      {r === 'failed' && <p role="alert" className="t-caption" style={{ margin: 0, color: 'var(--color-danger)' }}>{t('보호자(성인)의 휴대전화로 인증해 주세요.')}</p>}
      <GuardianVerify client={provider.client ?? null} prefix={verificationPrefix(user.id)} />
      <form action={logout} style={{ marginTop: 'auto', textAlign: 'center' }}>
        <button type="submit" className="t-caption hit" style={{ minHeight: 44, border: 0, background: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>{t('로그아웃')}</button>
      </form>
    </Page>
  )
}
