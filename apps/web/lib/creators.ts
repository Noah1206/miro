import { and, eq, sql } from 'drizzle-orm'
import { creatorFollows, db, users } from '@miro/db'
import { creatorName } from '@/lib/creator-name'

/** 공식 작품을 올리는 운영자 계정(scripts/seed-bl-characters.mts 의 OWNER) — 작품마다 그림체별 필명으로 보인다(lib/creator-name). */
export const OFFICIAL_OWNER_ID = 'f5a0dfcb-0e4c-443e-be17-c982234926c1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Creator = { key: string; name: string; avatarUrl: string | null; pen: boolean; followers: number; following: boolean; self: boolean; /** 11/20 이 사람이 팔로우하는 크리에이터 수·소개글(필명은 0·빈 글) */ followingCount: number; bio: string }

/** 작품의 크리에이터 키 — 운영 작품(slug official-*)은 필명('pen:이름'), 회원 작품은 그 회원 id. */
export function creatorKeyOf(c: { slug?: string | null; audience?: 'male' | 'female' | null; ownerId?: string | null }): string | null {
  if (c.slug?.startsWith('official-')) { const n = creatorName(c); return n ? `pen:${n}` : null }
  return c.ownerId ?? null
}
export const validCreatorKey = (key: string) => UUID.test(key) || /^pen:[^/]{1,40}$/.test(key)

/** 크리에이터 한 명 — 이름·사진·팔로워 수·내가 팔로우 중인지. 없는 회원이면 null. */
export async function creatorOf(key: string, viewerId: string | null): Promise<Creator | null> {
  if (!validCreatorKey(key)) return null
  const [counts] = await db.select({
    followers: sql<number>`count(*)::int`,
    following: viewerId ? sql<boolean>`coalesce(bool_or(${creatorFollows.followerId} = ${viewerId}), false)` : sql<boolean>`false`,
  }).from(creatorFollows).where(eq(creatorFollows.creatorKey, key))
  const base = { key, followers: counts?.followers ?? 0, following: !!counts?.following }
  if (key.startsWith('pen:')) return { ...base, name: key.slice(4), avatarUrl: null, pen: true, self: false, followingCount: 0, bio: '' }  // 필명은 운영자에게도 별도 크리에이터로 보인다
  const [[u], [mine]] = await Promise.all([
    db.select({ name: users.displayName, avatarUrl: users.avatarUrl, bio: users.creatorBio }).from(users).where(eq(users.id, key)).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(creatorFollows).where(eq(creatorFollows.followerId, key)),
  ])
  if (!u) return null
  return { ...base, name: u.name?.trim() || '이름 없는 크리에이터', avatarUrl: u.avatarUrl, pen: false, self: viewerId === key, followingCount: mine?.n ?? 0, bio: u.bio }
}

export async function setFollow(viewerId: string, key: string, follow: boolean): Promise<void> {
  if (!validCreatorKey(key) || viewerId === key) return
  if (follow) await db.insert(creatorFollows).values({ followerId: viewerId, creatorKey: key }).onConflictDoNothing()
  else await db.delete(creatorFollows).where(and(eq(creatorFollows.followerId, viewerId), eq(creatorFollows.creatorKey, key)))
}

export const CREATOR_BIO_MAX = 300

/** 11/20 크리에이터 소개글 — 본인만. */
export async function setCreatorBio(userId: string, bio: string): Promise<string> {
  const clean = bio.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, CREATOR_BIO_MAX)
  await db.update(users).set({ creatorBio: clean }).where(eq(users.id, userId))
  return clean
}
