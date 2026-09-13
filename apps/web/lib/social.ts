import { and, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'
import { characterBookmarks, characterComments, characters, db, users, worlds } from '@miro/db'
import { genreKeywords } from './genres'

export type CommentItem = {
  id: string
  body: string
  authorName: string
  createdAt: Date
  mine: boolean
}

/** 숨겨진 댓글은 목록에서 뺀다 — 원문은 검토 이력을 위해 DB 에 남는다. */
export async function listComments(characterId: string, viewerId: string | null, limit = 20): Promise<CommentItem[]> {
  const rows = await db.select({
    id: characterComments.id,
    body: characterComments.body,
    createdAt: characterComments.createdAt,
    userId: characterComments.userId,
    displayName: users.displayName,
    email: users.email,
  })
    .from(characterComments)
    .innerJoin(users, eq(users.id, characterComments.userId))
    .where(and(eq(characterComments.characterId, characterId), isNull(characterComments.hiddenAt)))
    .orderBy(desc(characterComments.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    // 이메일 전체를 남에게 보여주지 않는다 — 앞부분만.
    authorName: r.displayName ?? (r.email ? r.email.split('@')[0]! : '익명'),
    mine: r.userId === viewerId,
  }))
}

export async function countComments(characterId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` })
    .from(characterComments)
    .where(and(eq(characterComments.characterId, characterId), isNull(characterComments.hiddenAt)))
  return r?.n ?? 0
}

export async function addComment(characterId: string, userId: string, body: string): Promise<void> {
  const trimmed = body.trim()
  if (!trimmed) return
  await db.insert(characterComments).values({ characterId, userId, body: trimmed.slice(0, 500) })
}

/** 자기 댓글만 지울 수 있다. 운영자의 숨김과는 별개다. */
export async function removeComment(commentId: string, userId: string): Promise<void> {
  await db.delete(characterComments)
    .where(and(eq(characterComments.id, commentId), eq(characterComments.userId, userId)))
}

export async function isBookmarked(characterId: string, userId: string | null): Promise<boolean> {
  if (!userId) return false
  const [r] = await db.select({ id: characterBookmarks.id }).from(characterBookmarks)
    .where(and(eq(characterBookmarks.characterId, characterId), eq(characterBookmarks.userId, userId))).limit(1)
  return Boolean(r)
}

/** 토글. 이미 담겨 있으면 뺀다. 결과를 돌려줘 화면이 곧바로 맞춰지게 한다. */
export async function toggleBookmark(characterId: string, userId: string): Promise<boolean> {
  const on = await isBookmarked(characterId, userId)
  if (on) {
    await db.delete(characterBookmarks)
      .where(and(eq(characterBookmarks.characterId, characterId), eq(characterBookmarks.userId, userId)))
    return false
  }
  await db.insert(characterBookmarks).values({ characterId, userId }).onConflictDoNothing()
  return true
}

/**
 * 같은 장르의 다른 캐릭터. '비슷한 작품' 자리에 쓴다.
 * 홈의 행과 같은 분류를 쓴다 — 앞부분 문자열로 자르면 '현대 드라마' 와 '현대 로맨스' 가
 * 서로 다른 장르로 갈려 아무것도 매칭되지 않는다 (실제로 그 버그가 있었다).
 */
export async function similarCharacters(characterId: string, genre: string | null, limit = 6) {
  const keywords = genreKeywords(genre)
  if (keywords.length === 0) return []
  return db.select({
    id: characters.id, slug: characters.slug, name: characters.name,
    role: characters.role, tagline: characters.tagline, accentA: characters.accentA,
  })
    .from(characters)
    .innerJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(
      or(...keywords.map((k) => ilike(worlds.genre, `%${k}%`))),
      ne(characters.id, characterId),
      eq(characters.isOfficial, true),
      isNull(characters.deletedAt),
    ))
    .limit(limit)
}
