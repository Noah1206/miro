'use server'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, memories, roleplaySessions } from '@miro/db'
import { msg } from '@/lib/i18n'
import { currentUser } from '@/lib/auth'
import { reflectOnUser, type MemoryReflection } from '@/lib/memory-reflection'
import { observe } from '@/lib/observe'

/** 기억 페이지를 열었을 때 '나에 대한 생각'이 지금 기억보다 낡았으면 새로 쓴다. 실패하면 null(화면은 생각 칸만 숨긴다). */
export async function thinkAboutMe(sessionId: string): Promise<MemoryReflection | null> {
  const user = await currentUser()
  if (!user) return null
  return reflectOnUser(sessionId, user.id).catch((e) => { observe('memory.reflection_failed', { sessionId, error: e instanceof Error ? e.message.slice(0, 160) : 'unknown' }); return null })
}

/** 11/24 사용자: 기억 직접 고치기 — 한 줄짜리 장기 기억만(약속·아는 것·함께한 일·세계). 요약·지난 이야기는 AI 가 다시 쓰는 글이라 뺀다. */
const EDITABLE = ['promise', 'user_fact', 'preference', 'shared_event', 'relationship_change', 'conflict', 'world_fact']
const UUID = /^[0-9a-f-]{36}$/i
/** 내 방의, 고칠 수 있는 종류의 기억인지 — 조건 그대로 UPDATE·DELETE 에 쓴다. */
async function ownedMemory(sessionId: string, id: string) {
  const user = await currentUser()
  if (!user || !UUID.test(sessionId) || !UUID.test(id)) return null
  const [room] = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))).limit(1)
  return room ? and(eq(memories.id, id), eq(memories.sessionId, sessionId), inArray(memories.type, EDITABLE)) : null
}
const refresh = (sessionId: string) => { revalidatePath(`/chat/${sessionId}/memory`); revalidatePath(`/chat/${sessionId}/note`) }

/** 고친 기억은 사용자가 적은 것으로 표시하고(by_user), 뜻 검색용 벡터는 비워 다음 턴에 다시 만든다. */
export async function editMemory(sessionId: string, id: string, content: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const text = content.trim()
  if (!text) return { ok: false, error: msg('기억을 고칠 수 없어요.') }
  if (text.length > 300) return { ok: false, error: msg('기억은 300자까지 적을 수 있어요.') }
  const where = await ownedMemory(sessionId, id)
  if (!where) return { ok: false, error: msg('기억을 고칠 수 없어요.') }
  const done = await db.update(memories).set({ content: text, byUser: true, embedding: null }).where(where).returning({ id: memories.id })
  if (!done.length) return { ok: false, error: msg('기억을 고칠 수 없어요.') }
  refresh(sessionId)
  return { ok: true, content: text }
}

export async function deleteMemory(sessionId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const where = await ownedMemory(sessionId, id)
  if (!where) return { ok: false, error: msg('기억을 지울 수 없어요.') }
  const done = await db.delete(memories).where(where).returning({ id: memories.id })
  if (!done.length) return { ok: false, error: msg('기억을 지울 수 없어요.') }
  refresh(sessionId)
  return { ok: true }
}
