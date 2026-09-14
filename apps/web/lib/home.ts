import { and, desc, eq, inArray, isNull, sql, ne } from 'drizzle-orm'
import { db, characters, relationships, roleplaySessions, worldStates, worlds } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { listOfficials, type OfficialCard } from './characters'
import { GENRES, matchesGenre } from './genres'

export type HomeCard = OfficialCard & {
  /** 실제로 이 캐릭터와 대화한 사람 수. 초기에는 0 이며 그때는 표시하지 않는다. */
  plays: number
  /** 진행 중인 역할극이면 그 세션으로 바로 들어간다. */
  sessionId: string | null
  /** 카드 아래 한 줄. 이어지는 인연이면 지금 어디에 있는지, 아니면 역할. */
  caption: string | null
}

export type HomeRow = { key: string; title: string; items: HomeCard[] }

const card = (c: OfficialCard, over: Partial<HomeCard> = {}): HomeCard =>
  ({ ...c, sessionId: null, caption: c.role, plays: 0, ...over })

/**
 * 장르 행. 한 장짜리 행은 내보내지 않는다 — 카드 하나에 옆이 텅 비면 행처럼 보이지 않는다.
 * 캐릭터가 늘면 그 장르가 저절로 나타난다.
 */
const genreRows = (all: HomeCard[]): HomeRow[] =>
  GENRES.map((g) => ({ key: g.key, title: g.title, items: all.filter((c) => matchesGenre(c.genre, g.match)) }))
    .filter((r) => r.items.length >= 2)

/**
 * 홈은 주제를 가진 가로 스크롤 행들이다 (명세서 2.1 표시).
 * 빈 행은 내보내지 않는다 — 처음 온 사람에게는 ORIGINALS 한 줄만 보인다.
 */
export async function homeRows(userId: string | null): Promise<HomeRow[]> {
  const officials = await listOfficials()
  const plays = await playCounts(officials.map((o) => o.id))
  const withPlays = (c: OfficialCard) => card(c, { plays: plays.get(c.id) ?? 0 })
  // 로그인 전에는 보여줄 개인 기록이 없다 — ORIGINALS 한 줄로 시작한다.
  if (!userId) {
    const all = officials.map(withPlays)
    return [{ key: 'originals', title: 'MIRO ORIGINALS', items: all }, ...genreRows(all)]
  }

  const active = await db.select({ session: roleplaySessions, character: characters, world: worldStates, rel: relationships })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .innerJoin(relationships, eq(relationships.sessionId, roleplaySessions.id))
    .where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt)))
    .orderBy(desc(roleplaySessions.lastInteractionAt))
    .limit(12)

  const continuing: HomeCard[] = active.map((r) => ({
    id: r.character.id,
    slug: r.character.slug ?? r.character.id,
    name: r.character.name,
    role: r.character.role,
    occupation: r.character.occupation,
    relationshipKeywords: r.character.relationshipKeywords as string[],
    accentA: r.character.accentA,
    accentB: r.character.accentB,
    genre: null,
    tagline: r.character.tagline,
    images: r.character.images,
    plays: 0,
    sessionId: r.session.id,
    caption: r.session.characterStatus
      ?? `${r.world.currentLocation} · ${stageLabel(r.rel.stage as never, r.rel as never)}`,
  }))

  // 내가 만든 사람 — 아직 시작하지 않은 것까지 포함한다.
  const mine = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, role: characters.role,
    occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
    accentA: characters.accentA, accentB: characters.accentB, genre: worlds.genre,
    tagline: characters.tagline, images: characters.images,
  })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.ownerId, userId), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))
    .limit(12)

  const all = officials.map(withPlays)
  const shared = await publicCharacters(userId, 12)
  const sharedPlays = await playCounts(shared.map((c) => c.id))

  const rows: HomeRow[] = [
    { key: 'continuing', title: '이어서 대화하기', items: continuing },
    { key: 'originals', title: 'MIRO ORIGINALS', items: all },
    ...genreRows(all),
    {
      // 다른 사람이 공개한 캐릭터. 내 것은 아래 '내가 만든 사람' 에 있으니 뺀다.
      key: 'shared',
      title: '사람들이 만든 사람',
      items: shared.map((c) => card({ ...c, slug: c.slug ?? c.id }, { plays: sharedPlays.get(c.id) ?? 0 })),
    },
    {
      key: 'mine',
      title: '내가 만든 사람',
      items: (mine as OfficialCard[]).map((c) => card({ ...c, slug: c.slug ?? c.id })),
    },
  ]
  return rows.filter((r) => r.items.length > 0)
}


/** 다른 사람이 공개한 캐릭터 (초안·삭제 제외, 내 것 제외). 최근 것부터. */
async function publicCharacters(viewerId: string | null, limit: number): Promise<OfficialCard[]> {
  const rows = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, role: characters.role,
    occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
    accentA: characters.accentA, accentB: characters.accentB, genre: worlds.genre,
    tagline: characters.tagline, images: characters.images,
  })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(
      eq(characters.isPublic, true), eq(characters.isOfficial, false), eq(characters.isDraft, false),
      isNull(characters.deletedAt),
      ...(viewerId ? [ne(characters.ownerId, viewerId)] : []),
    ))
    .orderBy(desc(characters.createdAt))
    .limit(limit)
  return rows as OfficialCard[]
}

/** 캐릭터별 대화 인원. 한 번의 질의로 모아 카드에 붙인다. */
async function playCounts(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ id: roleplaySessions.characterId, n: sql<number>`count(distinct ${roleplaySessions.userId})::int` })
    .from(roleplaySessions)
    .where(and(inArray(roleplaySessions.characterId, ids), isNull(roleplaySessions.deletedAt)))
    .groupBy(roleplaySessions.characterId)
  return new Map(rows.map((r) => [r.id, r.n]))
}


/** 발견 그리드. 주제로 나누지 않고 한 번에 보여준다. */
export async function discoverGrid(userId: string | null): Promise<HomeCard[]> {
  const officials = await listOfficials()
  const plays = await playCounts(officials.map((o) => o.id))
  const all = officials.map((c) => card(c, { plays: plays.get(c.id) ?? 0 }))
  const shared = await publicCharacters(userId, 60)
  const sharedPlays = await playCounts(shared.map((c) => c.id))
  const sharedCards = shared.map((c) => card({ ...c, slug: c.slug ?? c.id }, { plays: sharedPlays.get(c.id) ?? 0 }))
  if (!userId) return [...all, ...sharedCards]

  const mine = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, role: characters.role,
    occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
    accentA: characters.accentA, accentB: characters.accentB, genre: worlds.genre,
    tagline: characters.tagline, images: characters.images,
  })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.ownerId, userId), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))
    .limit(30)

  return [...all, ...sharedCards, ...(mine as OfficialCard[]).map((c) => card({ ...c, slug: c.slug ?? c.id }))]
}
