import { notFound, redirect } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { characters, db, roleplaySessions } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page } from '@/components/ui'
import { NoteEditor } from './editor'
import { listPresets } from './actions'
import { NotesHeader } from '../memory/notes-header'

/** 11/17 유저노트 — 베이비챗과 같은 개념: 사용자가 이 이야기에서 꼭 지켜 달라고 적는 설정. 매 턴 사용자 입력 바로 앞에 실린다. 기억 노트(캐릭터의 기억)와 따로. */
export default async function UserNotePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { sessionId } = await params
  const [room] = await db.select({ name: characters.name, images: characters.images, note: roleplaySessions.userNote })
    .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))).limit(1)
  if (!room) notFound()
  const presets = await listPresets()
  return (
    <Page style={{ maxWidth: 640 }}>
      <NotesHeader sessionId={sessionId} name={room.name} photo={room.images?.[0]} active="note" />
      <NoteEditor sessionId={sessionId} initial={room.note} initialPresets={presets} />
    </Page>
  )
}
