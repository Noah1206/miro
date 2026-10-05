import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { consentRedirect } from '@/lib/consent-gate'
import { Checkbox, Notice, Page, PageHeader, TransitionLink } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { TRANSFER_ROWS } from '@/lib/legal/transfer-table'
import { getT } from '@/lib/i18n/server'
import { agreeTransfer } from './actions'

export async function generateMetadata(): Promise<Metadata> { const t = await getT(); return { title: t('개인정보 국외 이전 동의') } }

/**
 * 국외 이전 별도 동의 — 10/5 이전에 가입해 이 동의가 없는 회원에게 한 번 받는다(새 회원은 온보딩 마지막 단계에서 받는다).
 * 개인정보 보호법 제28조의8: 이전받는 자·국가·목적 요지를 보이고, 거부 방법과 불이익을 함께 알린 뒤 체크로 동의를 받는다.
 */
export default async function TransferConsentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const pending = await consentRedirect(user.id)
  if (pending !== '/onboarding/transfer') redirect(pending ?? '/home')
  const { error } = await searchParams
  const t = await getT()
  const summary = TRANSFER_ROWS.map((r) => `${r[0]!.replace(/\s*\(.*\)$/, '')} · ${r[1]} · ${r[4]}`)
  return (
    <Page style={{ maxWidth: 480 }}>
      <PageHeader title={t('개인정보 국외 이전 동의')} lead={t('AI 응답 생성 등을 위해 개인정보가 국외 업체에서 처리돼요. 서비스 이용약관·개인정보 처리방침 동의와 별도로 동의가 필요해요.')} />
      <ul className="t-caption" style={{ margin: '0 0 var(--space-4)', paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--color-text-secondary)' }} lang="ko">
        {summary.map((s) => <li key={s}>{s}</li>)}
      </ul>
      <p className="t-caption" style={{ margin: '0 0 var(--space-5)', color: 'var(--color-text-secondary)' }}>
        <TransitionLink href="/terms/transfer" className="hit" style={{ textDecoration: 'underline' }}>{t('이전 항목·시기·보유 기간 전문 보기')}</TransitionLink>
      </p>
      <Notice style={{ marginBottom: 'var(--space-4)' }}>{t('동의하지 않으면 MIRO를 이용할 수 없어요. 동의한 뒤에도 마이페이지 > 설정 > 계정 삭제로 언제든 철회할 수 있어요.')}</Notice>
      <form action={agreeTransfer} className="stack" style={{ gap: 'var(--space-4)' }}>
        <Checkbox name="transfer" required label={t('[필수] 개인정보 국외 이전에 동의합니다')} />
        {error && <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{t('동의해야 계속할 수 있어요.')}</p>}
        <SubmitButton variant="primary" size="lg" full>{t('동의하고 계속하기')}</SubmitButton>
      </form>
    </Page>
  )
}
