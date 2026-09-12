import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import { db, characters, realityContacts, roleplaySessions, worldStates } from '@miro/db'
import { purgeBefore } from '@miro/domain'

export type ArchiveItem = {
  id: string
  characterName: string
  role: string | null
  accentA: string | null
  status: 'active' | 'archived'
  lastInteractionAt: Date
  location: string
  time: string
  characterStatus: string | null
  unread: number
}

/** 보관함 목록. 공식/직접 생성 캐릭터를 하나의 목록으로 (명세서 8.1). 관계 수치는 싣지 않는다. */
export async function listSessions(userId: string, status: 'active' | 'archived'): Promise<ArchiveItem[]> {
  const rows = await db.select({
    id: roleplaySessions.id, characterName: characters.name, role: characters.role, accentA: characters.accentA,
    status: roleplaySessions.status, lastInteractionAt: roleplaySessions.lastInteractionAt,
    location: worldStates.currentLocation, time: worldStates.currentTime,
    characterStatus: roleplaySessions.characterStatus,
    unread: sql<number>`(select count(*)::int from ${realityContacts} rc where rc.session_id = ${roleplaySessions.id} and rc.status = 'sent')`,
  })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.status, status), isNull(roleplaySessions.deletedAt)))
    .orderBy(desc(roleplaySessions.lastInteractionAt))
  return rows as ArchiveItem[]
}

export async function setArchived(userId: string, sessionId: string, archived: boolean) {
  await db.update(roleplaySessions).set({ status: archived ? 'archived' : 'active' })
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt)))
}

/** 삭제 확정. 이미 삭제된 경우 그대로 둔다 — 반복 요청은 중복 처리되지 않는다 (명세서 8.1 예외). */
export async function softDelete(userId: string, sessionId: string): Promise<'deleted' | 'already' | 'not_found'> {
  const [s] = await db.select({ deletedAt: roleplaySessions.deletedAt }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId))).limit(1)
  if (!s) return 'not_found'
  if (s.deletedAt) return 'already'
  await db.update(roleplaySessions).set({ deletedAt: new Date(), status: 'archived' })
    .where(eq(roleplaySessions.id, sessionId))
  return 'deleted'
}

/** 보존 기간이 지난 삭제 역할극을 영구 삭제한다 (cascade). Cron 에서 호출. */
export async function purgeDeleted(now = new Date()): Promise<number> {
  const gone = await db.delete(roleplaySessions)
    .where(lt(roleplaySessions.deletedAt, purgeBefore(now)))
    .returning({ id: roleplaySessions.id })
  return gone.length
}
