import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, characters, relationships, roleplaySessions, worldStates, worlds } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { listOfficials, type OfficialCard } from './characters'

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
 * 장르 행. `worlds.genre` 는 '느와르 · 범죄 드라마' 처럼 여러 장르가 붙어 오므로
 * 포함 여부로 가른다 — 한 캐릭터가 두 행에 나와도 된다 (웹툰·OTT 가 그렇게 한다).
 * 코드에 캐릭터 이름을 박지 않는다: 새 캐릭터의 장르만 맞으면 자동으로 들어온다.
 */
const GENRES: Array<{ key: string; title: string; match: string[] }> = [
  { key: 'romance', title: '로맨스', match: ['로맨스', '연애'] },
  { key: 'thriller', title: '스릴러', match: ['스릴러', '느와르', '범죄', '미스터리'] },
  { key: 'office', title: '오피스', match: ['오피스', '직장'] },
  { key: 'fantasy', title: '판타지', match: ['판타지', '무협', 'SF'] },
  { key: 'drama', title: '드라마', match: ['드라마'] },
  { key: 'campus', title: '학원', match: ['학원', '캠퍼스', '하이틴'] },
]

const inGenre = (c: HomeCard, match: string[]): boolean =>
  Boolean(c.genre && match.some((m) => c.genre!.includes(m)))

/**
 * 장르 행. 한 장짜리 행은 내보내지 않는다 — 카드 하나에 옆이 텅 비면 행처럼 보이지 않는다.
 * 캐릭터가 늘면 그 장르가 저절로 나타난다.
 */
const genreRows = (all: HomeCard[]): HomeRow[] =>
  GENRES.map((g) => ({ key: g.key, title: g.title, items: all.filter((c) => inGenre(c, g.match)) }))
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
    tagline: characters.tagline,
  })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(eq(characters.ownerId, userId), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))
    .limit(12)

  const all = officials.map(withPlays)

  const rows: HomeRow[] = [
    { key: 'continuing', title: '이어서 대화하기', items: continuing },
    { key: 'originals', title: 'MIRO ORIGINALS', items: all },
    ...genreRows(all),
    {
      key: 'mine',
      title: '내가 만든 사람',
      items: (mine as OfficialCard[]).map((c) => card({ ...c, slug: c.slug ?? c.id })),
    },
  ]
  return rows.filter((r) => r.items.length > 0)
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
