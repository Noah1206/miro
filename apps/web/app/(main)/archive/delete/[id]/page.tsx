import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db, characters, roleplaySessions } from '@miro/db'
import { POLICY } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { confirmDelete } from '../../actions'

/** n49 — 삭제 확인. 삭제 시 결과와 확정/취소를 함께 표시한다. */
export default async function DeleteConfirm({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [row] = await db.select({ name: characters.name, deletedAt: roleplaySessions.deletedAt })
    .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, id), eq(roleplaySessions.userId, user.id))).limit(1)
  if (!row) notFound()
  if (row.deletedAt) redirect('/archive?deleted=1')

  return (
    <main style={{ minHeight: '100dvh', padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>{row.name}와의 역할극을 삭제할까요?</h1>
      <ul style={{ fontSize: 13.5, lineHeight: 1.8, color: 'var(--text-secondary)', paddingLeft: 18, margin: '0 0 28px' }}>
        <li>대화, 세계·관계·사건 상태, 기억이 목록에서 사라집니다.</li>
        <li>{POLICY.retention.deletedSessionDays}일 동안은 복구를 요청할 수 있으며, 그 뒤 영구 삭제됩니다.</li>
        <li>캐릭터 자체는 삭제되지 않습니다.</li>
      </ul>
      <form action={confirmDelete.bind(null, id)} style={{ display: 'flex', gap: 10 }}>
        <Link href="/archive" style={{ flex: 1, padding: 14, textAlign: 'center', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14 }}>취소</Link>
        <button type="submit" style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: '#D9363E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>삭제 확정</button>
      </form>
    </main>
  )
}
