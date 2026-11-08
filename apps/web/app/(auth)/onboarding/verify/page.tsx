import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { consentRedirect } from '@/lib/consent-gate'
import { Page } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { adultVerificationState } from '@/app/(main)/my/verify/actions'
import { logout } from '@/app/(main)/my/actions'
import { SignupVerify } from './signup-verify'
import s from '../transfer/transfer.module.css'

export async function generateMetadata(): Promise<Metadata> { const t = await getT(); return { title: t('본인인증') } }

/** 가입 마지막 단계(11/8) — 성인 서비스라 휴대전화 본인인증으로 청소년이 아닌지 확인한다. 마치기 전에는 (main) 화면에 들어가지 못한다. */
export default async function SignupVerifyPage({ searchParams }: { searchParams: Promise<{ r?: string; welcome?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const pending = await consentRedirect(user.id)
  if (pending !== '/onboarding/verify') redirect(pending ?? '/home')
  const [t, state, { r, welcome }] = await Promise.all([getT(), adultVerificationState(), searchParams])
  return (
    <Page className={s.page}>
      <h1 className={s.title}>{t('본인인증이 필요해요')}</h1>
      <p className={s.intro}>{t('MIRO는 만 19세 이상 성인을 위한 서비스예요. 「청소년 보호법」에 따라 처음 한 번 휴대전화 본인인증으로 나이를 확인해요. 운영자는 성인인지 여부만 받고 이름·전화번호는 저장하지 않아요.')}</p>
      <div style={{ marginTop: 28 }}>
        {r === 'cancelled' && <p role="status" className="t-caption" style={{ marginBottom: 16 }}>{t('본인인증을 마치지 않았어요.')}</p>}
        {r === 'failed' && <p role="alert" className="t-caption" style={{ marginBottom: 16 }}>{t('본인인증 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')}</p>}
        <SignupVerify state={state} welcome={!!welcome} />
      </div>
      <form action={logout} style={{ marginTop: 24, textAlign: 'center' }}>
        <button type="submit" className={s.back}>{t('다른 계정으로 로그인')}</button>
      </form>
    </Page>
  )
}
