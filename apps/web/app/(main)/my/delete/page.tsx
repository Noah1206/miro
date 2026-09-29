import { redirect } from 'next/navigation'
import { currentUser, requireUser, destroySession } from '@/lib/auth'
import { deleteAccount, deletionImpact } from '@/lib/ops/account'
import { track } from '@/lib/analytics/track'
import { ButtonLink, Page } from '@/components/ui'
import { SubmitButton } from '@/components/ui/submit-button'
import { getT } from '@/lib/i18n/server'

async function confirm() {
  'use server'
  const user = await requireUser(); const r = await deleteAccount(user.id)
  if (r === 'completed') await track(null, 'account_deleted', {})
  await destroySession(); redirect(r === 'completed' ? '/deleted' : '/deleted?already=1')
}
export default async function DeleteAccountPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const i = await deletionImpact(user.id)
  const t = await getT()
  return (
    <Page style={{ maxWidth: 480, paddingTop: 'var(--space-7)' }}>
      <h1 className="t-title-2 t-quote" style={{ marginBottom: 12 }}>{t('여기서 떠날까요?')}</h1>
      <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 18 }}>{t('삭제하면 같은 계정으로 다시 들어올 수 없고, 이어지던 인연과 저장된 상태에 접근할 수 없습니다.')}</p>
      <ul data-impact className="t-body" style={{ lineHeight: 1.9, paddingLeft: 18, margin: '0 0 var(--space-6)' }}>
        <li>{t('역할극 {n}개와 그 세계·관계·사건·기억', { n: i.sessions })}</li>
        <li>{t('직접 만든 캐릭터 {n}개', { n: i.createdCharacters })}</li>
        <li>{t('기억 {memories}건 · 사건 {events}건', { memories: i.memories, events: i.events })}</li>
        <li>{t('이용권: {status}', { status: i.subscription === 'none' ? t('없음') : i.subscription === 'active' ? t('Pro 자격이 종료됩니다') : t('남은 기간 그대로') })}</li>
      </ul>
      <form action={confirm} style={{ display: 'flex', gap: 10 }}>
        <ButtonLink href="/my" direction="back" variant="secondary" style={{ flex: 1 }}>{t('취소')}</ButtonLink>
        <SubmitButton variant="destructive" full style={{ flex: 1 }}>{t('계정 삭제 확정')}</SubmitButton>
      </form>
    </Page>
  )
}
