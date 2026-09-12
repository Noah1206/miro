import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentUser, requireUser, destroySession } from '@/lib/auth'
import { deleteAccount, deletionImpact } from '@/lib/ops/account'

async function confirm() {
  'use server'
  const user = await requireUser()
  const r = await deleteAccount(user.id)
  await destroySession()
  redirect(r === 'completed' ? '/deleted' : '/deleted?already=1')
}

/** n68/n69/n70 — 계정 삭제 확인. 확정 전 영향 정보를 반드시 보여준다 (명세서 12.1). */
export default async function DeleteAccountPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const i = await deletionImpact(user.id)
  return (
    <main style={{ minHeight: '100dvh', padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>계정을 삭제할까요?</h1>
      <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 18px' }}>삭제하면 같은 계정으로 다시 로그인할 수 없고, 보관함과 저장된 상태에 접근할 수 없습니다.</p>
      <ul data-impact style={{ fontSize: 13.5, lineHeight: 1.9, paddingLeft: 18, margin: '0 0 28px', color: 'var(--text-primary)' }}>
        <li>역할극 {i.sessions}개와 그 세계·관계·사건·기억 상태</li>
        <li>직접 만든 캐릭터 {i.createdCharacters}개</li>
        <li>기억 {i.memories}건 · 사건 {i.events}건</li>
        <li>구독: {i.subscription === 'none' ? '없음' : i.subscription === 'active' ? 'Pro 자격이 해지됩니다' : '해지 예정 상태 유지'}</li>
      </ul>
      <form action={confirm} style={{ display: 'flex', gap: 10 }}>
        <Link href="/my" style={{ flex: 1, padding: 14, textAlign: 'center', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14 }}>취소</Link>
        <button type="submit" style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: '#D9363E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>계정 삭제 확정</button>
      </form>
    </main>
  )
}
