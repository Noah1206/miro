import { notFound, redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db, characters, roleplaySessions } from '@miro/db'
import { POLICY } from '@miro/config'
import { currentUser } from '@/lib/auth'
import { Button, ButtonLink, Page } from '@/components/ui'
import { confirmDelete } from '../../actions'

/** n49 — 삭제 확인. 무엇이 사라지고 언제까지 되돌릴 수 있는지, 확정과 취소. */
export default async function DeleteConfirm({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [row] = await db.select({ name: characters.name, deletedAt: roleplaySessions.deletedAt }).from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, id), eq(roleplaySessions.userId, user.id))).limit(1)
  if (!row) notFound()
  if (row.deletedAt) redirect('/archive?deleted=1')
  return (
    <Page style={{ maxWidth: 480, paddingTop: 'var(--space-7)' }}>
      <h1 className="t-title-2 t-quote" style={{ marginBottom: 14 }}>{row.name}와의 시간을 지울까요?</h1>
      <ul className="t-body" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.85, paddingLeft: 18, margin: '0 0 var(--space-6)' }}>
        <li>대화, 세계·관계·사건 상태, 기억이 목록에서 사라집니다.</li>
        <li>{POLICY.retention.deletedSessionDays}일 동안은 복구를 요청할 수 있으며, 그 뒤 영구 삭제됩니다.</li>
        <li>캐릭터 자체는 남습니다.</li>
      </ul>
      <form action={confirmDelete.bind(null, id)} style={{ display: 'flex', gap: 10 }}>
        <ButtonLink href="/archive" direction="back" variant="secondary" style={{ flex: 1 }}>취소</ButtonLink>
        <Button type="submit" variant="destructive" full style={{ flex: 1 }}>삭제 확정</Button>
      </form>
    </Page>
  )
}
