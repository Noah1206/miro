import { and, eq, isNull, lt, sql } from 'drizzle-orm'
import { db, realityContacts, roleplaySessions } from '@miro/db'
import { purgeBefore } from '@miro/domain'
import { feature } from '@miro/config'

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
  href?: string
  storyTitle?: string
  runNo?: number
}

export type ArchiveCursor = {
  status: 'active' | 'archived'
  lastInteractionAt: string
  id: string
}

export type ArchivePage = { items: ArchiveItem[]; nextCursor: ArchiveCursor | null }

const PAGE_SIZE = 25

/** 안 읽은 연락 전체 수 — 캐릭터가 보낸 문자·전화 중 아직 안 본 것. 대화 목록의 방별 빨간 숫자(unread)를 모두 더한 값이고, 홈 알림 종에 쓴다. */
export async function unreadContactCount(userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(realityContacts)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, realityContacts.sessionId))
    .where(and(eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt), eq(realityContacts.status, 'sent')))
  const [story] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM story_messages m JOIN story_runs r ON r.id = m.run_id
    WHERE r.user_id = ${userId}::uuid AND r.status <> 'archived'
      AND m.channel = 'dm' AND m.role = 'character' AND m.read_at IS NULL
  `)
  return (row?.n ?? 0) + (story?.n ?? 0)
}

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
  const after = validCursor ? sql`AND (
    (${cursor.status} = 'active' AND ${!options.status} AND status = 'archived')
    OR (status = ${cursor.status} AND (last_at < ${cursorDate}::timestamptz
      OR (last_at = ${cursorDate}::timestamptz AND id < ${cursor.id}::uuid)))
  )` : sql``
  const result = await db.execute<{
    id: string; character_name: string; character_slug: string | null; character_image: string | null;
    role: string | null; accent_a: string | null; status: 'active' | 'archived'; last_at: string;
    location: string; time: string; character_status: string | null; last_message: string | null;
    unread: number; cursor_time: string; href: string; story_title: string | null; run_no: number | null;
  }>(sql`
    WITH inbox AS (
      SELECT r.id, c.name AS character_name, c.slug AS character_slug, c.images->>0 AS character_image,
        c.role, c.accent_a, r.status, r.last_interaction_at AS last_at,
        w.current_location AS location, w.current_time AS time, r.character_status,
        (SELECT left(m.content, 180) FROM messages m WHERE m.session_id = r.id AND m.hidden_at IS NULL
          ${feature('voiceCall') || feature('videoCall') ? sql`` : sql`AND m.kind <> 'call_record'`}
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message,
        (SELECT count(*)::int FROM reality_contacts rc WHERE rc.session_id = r.id AND rc.status = 'sent') AS unread,
        '/chat/' || r.id AS href, NULL::text AS story_title, NULL::int AS run_no
      FROM roleplay_sessions r JOIN characters c ON c.id = r.character_id JOIN world_states w ON w.session_id = r.id
      WHERE r.user_id = ${userId}::uuid AND r.deleted_at IS NULL
      UNION ALL
      SELECT latest.id, person->>'name', s.slug || '-' || (person->>'key'), person->>'image',
        NULL::text, NULL::text, CASE WHEN r.status = 'archived' THEN 'archived' ELSE 'active' END,
        latest.created_at, '', '', NULL::text, left(latest.content, 180),
        CASE WHEN r.status = 'archived' THEN 0 ELSE
          (SELECT count(*)::int FROM story_messages um WHERE um.run_id = r.id AND um.channel = 'dm'
            AND um.thread = person->>'key' AND um.role = 'character' AND um.read_at IS NULL) END,
        '/messages/story/' || r.id || '/' || (person->>'key'), s.title, r.run_no
      FROM story_runs r JOIN stories s ON s.id = r.story_id
      CROSS JOIN LATERAL jsonb_array_elements(s.public->'characters') person
      CROSS JOIN LATERAL (
        SELECT m.id, m.created_at, m.content FROM story_messages m
        WHERE m.run_id = r.id AND m.channel = 'dm' AND m.thread = person->>'key'
        ORDER BY m.created_at DESC, m.id DESC LIMIT 1
      ) latest
      WHERE r.user_id = ${userId}::uuid
    )
    SELECT *, to_char(last_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM inbox
    WHERE true ${options.status ? sql`AND status = ${options.status}` : sql``}
      ${query ? sql`AND (position(lower(${query}) in lower(character_name)) > 0 OR position(lower(${query}) in lower(coalesce(story_title, ''))) > 0)` : sql``}
      ${after}
    ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, last_at DESC, id DESC
    LIMIT ${PAGE_SIZE + 1}
  `)
  const rows = result.map(r => ({
    id: r.id, characterName: r.character_name, characterSlug: r.character_slug, characterImage: r.character_image,
    role: r.role, accentA: r.accent_a, status: r.status, lastInteractionAt: new Date(r.last_at),
    location: r.location, time: r.time, characterStatus: r.character_status, lastMessage: r.last_message,
    unread: r.unread, cursorTime: r.cursor_time, href: r.href,
    ...(r.story_title ? { storyTitle: r.story_title, runNo: r.run_no! } : {}),
  }))
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
