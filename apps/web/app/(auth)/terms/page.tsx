import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, termsConsents } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page, PageHeader } from '@/components/ui'
import { TermsList } from './list'
import { agreeToTerms } from './actions'

const ITEMS = [
  { key: 'terms', title: '서비스 이용약관', href: '/terms/service' },
  { key: 'privacy', title: '개인정보 처리방침', href: '/terms/privacy' },
  { key: 'ai', title: 'AI 생성 콘텐츠 안내', href: '/terms/ai' },
]

export default async function TermsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const existing = await db.select({ id: termsConsents.id }).from(termsConsents).where(eq(termsConsents.userId, user.id)).limit(1)
  if (existing.length > 0) redirect('/home')
  return (
    <Page style={{ maxWidth: 480, paddingTop: 'var(--space-7)' }}>
      <PageHeader title="시작하기 전에" lead="MIRO를 이용하려면 아래 항목에 동의해야 합니다." />
      <TermsList items={ITEMS} action={agreeToTerms} />
    </Page>
  )
}
