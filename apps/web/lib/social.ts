import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { characterBookmarks, characterCommentLikes, characterComments, characters, db, users, worlds } from '@miro/db'
import { genreKeywords } from './genres'

export type CommentItem = {
  id: string
  body: string
  authorName: string
  createdAt: Date
  mine: boolean
  likeCount: number
  liked: boolean
  replies: CommentItem[]
}

/**
 * 최상위 댓글(+ 그 답글들)을 가져온다. 답글은 1단계만 — 부모 댓글 밑에 묶인다.
 * sort 'popular' 는 좋아요 많은 순, 'recent' 는 최신순. 카드 미리보기는 limit 로 자른다.
 */
export async function listComments(
  characterId: string, viewerId: string | null, limit = 20, sort: 'popular' | 'recent' = 'recent',
): Promise<CommentItem[]> {
  const all = await listAllComments(characterId, viewerId)
  const top = all.filter((c) => !c.parentId)
  const sorted = sort === 'popular'
    ? [...top].sort((a, b) => b.likeCount - a.likeCount || b.createdAt.getTime() - a.createdAt.getTime())
    : top // 이미 createdAt desc 로 가져온 상태
  return sorted.slice(0, limit)
}

type RawComment = CommentItem & { parentId: string | null }

/** 숨겨진 댓글은 목록에서 뺀다 — 원문은 검토 이력을 위해 DB 에 남는다. */
async function listAllComments(characterId: string, viewerId: string | null): Promise<RawComment[]> {
  const rows = await db.select({
    id: characterComments.id,
    body: characterComments.body,
    createdAt: characterComments.createdAt,
    userId: characterComments.userId,
    parentId: characterComments.parentId,
    displayName: users.displayName,
    email: users.email,
  })
    .from(characterComments)
    .innerJoin(users, eq(users.id, characterComments.userId))
    .where(and(eq(characterComments.characterId, characterId), isNull(characterComments.hiddenAt)))
    .orderBy(desc(characterComments.createdAt))

  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const likeRows = await db.select({
    commentId: characterCommentLikes.commentId,
    n: sql<number>`count(*)::int`,
    likedByMe: sql<boolean>`bool_or(${characterCommentLikes.userId} = ${viewerId ?? sql`null`})`,
  })
    .from(characterCommentLikes)
    .where(inArray(characterCommentLikes.commentId, ids))
    .groupBy(characterCommentLikes.commentId)
  const likesByComment = new Map(likeRows.map((r) => [r.commentId, r]))

  const flat: RawComment[] = rows.map((r) => {
    const likes = likesByComment.get(r.id)
    return {
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      // 이메일 전체를 남에게 보여주지 않는다 — 앞부분만.
      authorName: r.displayName ?? (r.email ? r.email.split('@')[0]! : '익명'),
      mine: r.userId === viewerId,
      likeCount: likes?.n ?? 0,
      liked: Boolean(likes?.likedByMe),
      parentId: r.parentId,
      replies: [],
    }
  })

  const byId = new Map(flat.map((c) => [c.id, c]))
  for (const c of flat) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.replies.push(c)
  }
  // 답글은 오래된 순으로 — 대화가 쌓인 순서 그대로 읽힌다.
  for (const c of flat) c.replies.reverse()
  return flat
}

export async function countComments(characterId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` })
    .from(characterComments)
    .where(and(eq(characterComments.characterId, characterId), isNull(characterComments.hiddenAt)))
  return r?.n ?? 0
}

export async function addComment(characterId: string, userId: string, body: string, parentId?: string | null): Promise<void> {
  const trimmed = body.trim()
  if (!trimmed) return
  await db.insert(characterComments).values({ characterId, userId, parentId: parentId ?? null, body: trimmed.slice(0, 500) })
}

/** 자기 댓글만 지울 수 있다. 운영자의 숨김과는 별개다. */
export async function removeComment(commentId: string, userId: string): Promise<void> {
  await db.delete(characterComments)
    .where(and(eq(characterComments.id, commentId), eq(characterComments.userId, userId)))
}

/** 좋아요 토글. 이미 눌렀으면 뗀다. */
export async function toggleCommentLike(commentId: string, userId: string): Promise<boolean> {
  const [existing] = await db.select({ id: characterCommentLikes.id }).from(characterCommentLikes)
    .where(and(eq(characterCommentLikes.commentId, commentId), eq(characterCommentLikes.userId, userId))).limit(1)
  if (existing) {
    await db.delete(characterCommentLikes).where(eq(characterCommentLikes.id, existing.id))
    return false
  }
  await db.insert(characterCommentLikes).values({ commentId, userId }).onConflictDoNothing()
  return true
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
  const rows = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name,
    role: characters.role, tagline: characters.tagline, accentA: characters.accentA,
    genre: worlds.genre, relationshipKeywords: characters.relationshipKeywords, images: characters.images,
    // 카드의 조회수 배지 — 홈과 같은 기준(대화한 사람 수)으로 센다.
    plays: sql<number>`(
      select count(distinct s.user_id)::int from roleplay_sessions s
      where s.character_id = ${characters.id} and s.deleted_at is null
    )`,
  })
    .from(characters)
    .innerJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(
      or(...keywords.map((k) => ilike(worlds.genre, `%${k}%`))),
      ne(characters.id, characterId),
      or(eq(characters.isOfficial, true), eq(characters.isPublic, true)),
      eq(characters.isDraft, false),
      isNull(characters.deletedAt),
    ))
    .limit(limit)
  return rows
}
