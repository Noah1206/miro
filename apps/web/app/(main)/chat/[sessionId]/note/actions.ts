'use server'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db, roleplaySessions, userNotePresets } from '@miro/db'
import { currentUser } from '@/lib/auth'

/** 11/17 유저노트 — 이 방에 적용 중인 노트 저장 + 베이비챗식 보관함(여러 개 저장, 방마다 하나 적용). */
export type NotePreset = { id: string; title: string; content: string }
const NOTE_MAX = 2000, TITLE_MAX = 40, PRESET_LIMIT = 20

const room = (sessionId: string, userId: string) => and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))

export async function listPresets(): Promise<NotePreset[]> {
  const user = await currentUser()
  if (!user) return []
  return db.select({ id: userNotePresets.id, title: userNotePresets.title, content: userNotePresets.content }).from(userNotePresets)
    .where(eq(userNotePresets.userId, user.id)).orderBy(desc(userNotePresets.updatedAt)).limit(PRESET_LIMIT)
}

/** 이 방에 적용 중인 노트를 저장한다(빈 글이면 지운다). */
export async function saveRoomNote(sessionId: string, content: string): Promise<boolean> {
  const user = await currentUser()
  const note = content.trim()
  if (!user || note.length > NOTE_MAX) return false
  const rows = await db.update(roleplaySessions).set({ userNote: note }).where(room(sessionId, user.id)).returning({ id: roleplaySessions.id })
  return rows.length > 0
}

/** 보관함에 저장 — id 가 있으면 그 노트를 고치고, 없으면 새로(회원당 20개까지). 저장된 노트 id 를 돌려준다. */
export async function savePreset(id: string | null, title: string, content: string): Promise<{ id: string } | 'invalid' | 'full'> {
  const user = await currentUser()
  const t = title.trim().slice(0, TITLE_MAX), c = content.trim()
  if (!user || !t || !c || c.length > NOTE_MAX) return 'invalid'
  if (id) {
    const rows = await db.update(userNotePresets).set({ title: t, content: c, updatedAt: new Date() })
      .where(and(eq(userNotePresets.id, id), eq(userNotePresets.userId, user.id))).returning({ id: userNotePresets.id })
    if (rows[0]) return rows[0]
  }
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(userNotePresets).where(eq(userNotePresets.userId, user.id))
  if ((count?.n ?? 0) >= PRESET_LIMIT) return 'full'
  const [row] = await db.insert(userNotePresets).values({ userId: user.id, title: t, content: c }).returning({ id: userNotePresets.id })
  return row!
}

export async function deletePreset(id: string): Promise<void> {
  const user = await currentUser()
  if (!user) return
  await db.delete(userNotePresets).where(and(eq(userNotePresets.id, id), eq(userNotePresets.userId, user.id)))
}
