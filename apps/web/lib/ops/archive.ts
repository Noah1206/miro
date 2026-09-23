import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db, characters, realityContacts, roleplaySessions, worldStates } from '@miro/db'
import { purgeBefore } from '@miro/domain'

export type ArchiveItem = {
  id: string
  characterName: string
  characterSlug: string | null
  characterImage: string | null
  role: string | null
  accentA: string | null
  status: 'active' | 'archived'
  lastInteractionAt: Date
  location: string
  time: string
  characterStatus: string | null
  lastMessage: string | null
  unread: number
}

export type ArchiveCursor = {
  status: 'active' | 'archived'
  lastInteractionAt: string
  id: string
}

export type ArchivePage = { items: ArchiveItem[]; nextCursor: ArchiveCursor | null }

const PAGE_SIZE = 25

/**
 * 보관함 목록. 공식/직접 생성 캐릭터를 하나의 목록으로 (명세서 8.1). 관계 수치는 싣지 않는다.
 * status 를 주지 않으면 진행 중과 보관됨을 한 목록으로 — 진행 중이 위에 온다.
 */
export async function listSessions(userId: string, options: {
  status?: 'active' | 'archived'
  query?: string
  cursor?: ArchiveCursor | null
} = {}): Promise<ArchivePage> {
  const query = typeof options.query === 'string' ? options.query.trim().slice(0, 100) : ''
  const cursor = options.cursor
  const cursorDate = cursor && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(cursor.lastInteractionAt)
    && !Number.isNaN(Date.parse(cursor.lastInteractionAt))
    && new Date(cursor.lastInteractionAt).toISOString().slice(0, 23) === cursor.lastInteractionAt.slice(0, 23)
    ? cursor.lastInteractionAt : null
  const validCursor = cursor && cursorDate && (cursor.status === 'active' || cursor.status === 'archived')
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursor.id)
  if (cursor && !validCursor) throw new Error('Invalid archive cursor')
  const cursorCondition = validCursor ? or(
    ...(cursor.status === 'active' && !options.status ? [eq(roleplaySessions.status, 'archived')] : []),
    and(
      eq(roleplaySessions.status, cursor.status),
      or(
        sql`${roleplaySessions.lastInteractionAt} < ${cursorDate}::timestamptz`,
        and(eq(roleplaySessions.lastInteractionAt, sql`${cursorDate}::timestamptz`), lt(roleplaySessions.id, cursor.id)),
      ),
    ),
  ) : undefined
  const rows = await db.select({
    id: roleplaySessions.id, characterName: characters.name, characterSlug: characters.slug,
    characterImage: sql<string | null>`${characters.images}->>0`,
    role: characters.role, accentA: characters.accentA,
    status: roleplaySessions.status, lastInteractionAt: roleplaySessions.lastInteractionAt,
    location: worldStates.currentLocation, time: worldStates.currentTime,
    characterStatus: roleplaySessions.characterStatus,
    lastMessage: sql<string | null>`(select left("content", 180) from "messages" where "session_id" = ${roleplaySessions.id} and "hidden_at" is null order by "created_at" desc, "id" desc limit 1)`,
    unread: sql<number>`(select count(*)::int from ${realityContacts} rc where rc.session_id = ${roleplaySessions.id} and rc.status = 'sent')`,
    cursorTime: sql<string>`to_char(${roleplaySessions.lastInteractionAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .where(and(
      eq(roleplaySessions.userId, userId),
      ...(options.status ? [eq(roleplaySessions.status, options.status)] : []),
      isNull(roleplaySessions.deletedAt),
      ...(query ? [sql`position(lower(${query}) in lower(${characters.name})) > 0`] : []),
      ...(cursorCondition ? [cursorCondition] : []),
    ))
    // 진행 중이 먼저, 그 안에서 최근 순.
    .orderBy(sql`case when ${roleplaySessions.status} = 'active' then 0 else 1 end`, desc(roleplaySessions.lastInteractionAt), desc(roleplaySessions.id))
    .limit(PAGE_SIZE + 1)
  const items = rows.slice(0, PAGE_SIZE).map(({ cursorTime: _cursorTime, ...item }) => item)
  const last = rows[PAGE_SIZE - 1]
  return {
    items,
    nextCursor: rows.length > PAGE_SIZE && last ? {
      status: last.status,
      lastInteractionAt: last.cursorTime,
      id: last.id,
    } : null,
  }
}

/** 내부 상태 전환. 현재 사용자 화면에서는 보관 기능을 노출하지 않는다. */
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
