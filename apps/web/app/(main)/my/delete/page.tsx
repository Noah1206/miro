import { redirect } from 'next/navigation'
import { currentUser, requireUser, destroySession } from '@/lib/auth'
import { deleteAccount, deletionImpact } from '@/lib/ops/account'
import { track } from '@/lib/analytics/track'
import { Button, ButtonLink, Page } from '@/components/ui'

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
  return (
    <Page style={{ maxWidth: 480, paddingTop: 'var(--space-7)' }}>
      <h1 className="t-title-2 t-quote" style={{ marginBottom: 12 }}>여기서 떠날까요?</h1>
      <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 18 }}>삭제하면 같은 계정으로 다시 들어올 수 없고, 이어지던 인연과 저장된 상태에 접근할 수 없습니다.</p>
      <ul data-impact className="t-body" style={{ lineHeight: 1.9, paddingLeft: 18, margin: '0 0 var(--space-6)' }}>
        <li>역할극 {i.sessions}개와 그 세계·관계·사건·기억</li>
        <li>직접 만든 캐릭터 {i.createdCharacters}개</li>
        <li>기억 {i.memories}건 · 사건 {i.events}건</li>
        <li>구독: {i.subscription === 'none' ? '없음' : i.subscription === 'active' ? 'Pro 자격이 해지됩니다' : '해지 예정 상태 유지'}</li>
      </ul>
      <form action={confirm} style={{ display: 'flex', gap: 10 }}>
        <ButtonLink href="/my" direction="back" variant="secondary" style={{ flex: 1 }}>취소</ButtonLink>
        <Button type="submit" full style={{ flex: 1, background: 'var(--color-danger)', color: '#fff', borderColor: 'var(--color-danger)' }}>계정 삭제 확정</Button>
      </form>
    </Page>
  )
}
