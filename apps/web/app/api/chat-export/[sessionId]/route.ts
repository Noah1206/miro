import { and, asc, eq, isNull } from 'drizzle-orm'
import { characters, db, messages, roleplaySessions } from '@miro/db'
import { currentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/**
 * 11/16 대화 원문 내려받기(TXT) — 커뮤니티 조사: 긴 방을 직접 보관·요약하려는 사람이 기록 내려받기를 찾는다.
 * 본인 방만(세션 조인), 운영이 숨긴 메시지는 뺀다. 글이 아닌 메시지(사진·통화 기록 등)는 종류만 표시한다.
 * ponytail: 한 번에 다 읽는다 — 수만 턴 방이 생기면 스트림으로.
 */
export async function GET(_: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await currentUser()
  if (!user) return new Response('unauthorized', { status: 401 })
  const { sessionId } = await params
  const [room] = await db.select({ name: characters.name }).from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt))).limit(1)
  if (!room) return new Response('not found', { status: 404 })
  const rows = await db.select({ role: messages.role, kind: messages.kind, content: messages.content, turn: messages.turnIndex })
    .from(messages).where(and(eq(messages.sessionId, sessionId), isNull(messages.hiddenAt))).orderBy(asc(messages.turnIndex), asc(messages.createdAt))
  const who = (role: string) => role === 'user' ? '나' : role === 'character' ? room.name : role === 'npc' ? '주변 인물' : '서술'
  const body = rows.filter(r => r.role !== 'system').map(r => {
    const text = r.kind === 'text' || r.kind === 'messenger' || r.kind === 'reality_message' ? r.content : `(${r.kind})${r.content ? ' ' + r.content : ''}`
    return `[${r.turn}] ${who(r.role)}\n${text}`
  }).join('\n\n')
  return new Response(`${room.name}\n\n${body}\n`, { headers: {
    'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store',
    'content-disposition': `attachment; filename="miro-chat.txt"; filename*=UTF-8''${encodeURIComponent(room.name)}.txt` } })
}
