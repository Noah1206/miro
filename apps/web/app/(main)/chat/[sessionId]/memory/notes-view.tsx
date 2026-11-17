import { notFound, redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { db, roleplaySessions } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page } from '@/components/ui'
import { NoteEditor } from '../note/editor'
import { listPresets } from '../note/actions'
import { MemoryNote } from './memory-note'
import { NotesSwitcher } from './notes-switcher'

/** 11/17 기억 노트·유저노트 한 화면 — 두 판을 미리 그려 두고 토글은 화면 안에서만 바꾼다(새로고침 없이, 주소만 /memory·/note 로 갈아끼움). */
export async function NotesView({ sessionId, active }: { sessionId: string; active: 'memory' | 'note' }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [room] = await db.select({ note: roleplaySessions.userNote }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))).limit(1)
  if (!room) notFound()
  const presets = await listPresets()
  return (
    <Page style={{ maxWidth: 640 }}>
      <NotesSwitcher sessionId={sessionId} initial={active}
        memory={<MemoryNote sessionId={sessionId} userId={user.id} />}
        note={<NoteEditor sessionId={sessionId} initial={room.note} initialPresets={presets} />} />
    </Page>
  )
}
