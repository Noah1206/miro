import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { db, characters, roleplaySessions, contactProfiles } from '@miro/db'
import { listOfficials, type ExperienceType, type OfficialCard } from './characters'
import { indexedDiscoveryEnabled, rankedPopularIds } from './search-index'
import { searchGenres, searchNeedle } from './search-params'
import { msg } from '@/lib/i18n'

export type HomeCard = OfficialCard & {
  /** 실제로 이 캐릭터와 대화한 사람 수. 초기에는 0 이며 그때는 표시하지 않는다. */
  plays: number
  /** 카드 아래 한 줄. */
  caption: string | null
}

export type HomeRow = { key: string; title: string; items: HomeCard[] }
export type CardPage = { items: HomeCard[]; nextCursor: string | null }

const PAGE_SIZE = 12
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const card = (c: OfficialCard, over: Partial<HomeCard> = {}): HomeCard =>
  ({ ...c, caption: c.role, plays: 0, ...over })

const selectedWorldGenre = sql<string | null>`(select w.genre from worlds w where w.character_id = ${characters.id} order by w.id limit 1)`

/**
 * 앱은 미로 캐릭터만 보여준다(2026-09-29 결정). 옛 일반 캐릭터는 목록·검색에 나오지 않고, 이미 연 대화만 이어진다.
 */
export async function homeRows(): Promise<HomeRow[]> {
  const { items } = await homePage(null)

  const rows: HomeRow[] = [
    { key: 'shared', title: msg('전체 이야기'), items },
  ]
  return rows.filter((r) => r.items.length > 0)
}

const pageColumns = {
  id: characters.id, slug: characters.slug, name: characters.name, role: characters.role,
  occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
  accentA: characters.accentA, accentB: characters.accentB, genre: selectedWorldGenre,
  tagline: characters.tagline, startingContext: characters.startingContext,
  images: sql<string[]>`case when ${characters.images}->>0 is null then '[]'::jsonb else jsonb_build_array(${characters.images}->>0) end`,
  contactEnabled: contactProfiles.enabled,
  createdAtKey: sql<string>`to_char(${characters.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
}

function decodeCursor(value: string | null) {
  if (!value) return null
  if (value.length > 160) throw new Error('INVALID_CURSOR')
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string' || !UUID.test(parsed[1])) throw new Error('INVALID_CURSOR')
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed[0]) || Number.isNaN(Date.parse(parsed[0]))) throw new Error('INVALID_CURSOR')
    return { createdAt: parsed[0], id: parsed[1] }
  } catch { throw new Error('INVALID_CURSOR') }
}

/**
 * 홈 장르 칩(2026-09-30, 예전 검색 페이지의 장르 버튼) — 세계 중 하나라도 고른 장르 중 하나를 품으면 맞는다.
 * worlds.genre 는 '현대 로맨스 · 일상' 처럼 붙어 오므로 '로맨스' 칩이 이것도 잡는다(2026-09-30 요청). 띄어쓰기·대소문자는 무시한다.
 */
function genreMatch(characterId: SQLWrapper, genres: string[]): SQL | undefined {
  const normalized = searchGenres(genres)
  if (!normalized) throw new Error('INVALID_GENRE')
  if (normalized.length === 0) return undefined
  return sql`exists (
    select 1 from worlds w
    where w.character_id = ${characterId}
      and (${sql.join(normalized.map(value => sql`position(${searchNeedle(value)} in lower(regexp_replace(w.genre, '[[:space:]]+', '', 'g'))) > 0`), sql` or `)})
  )`
}

async function cardPage(type: ExperienceType | null, userId: string | null, cursorValue: string | null, includeOwned = false, genres: string[] = [], contactOnly = false): Promise<CardPage> {
  const cursor = decodeCursor(cursorValue)
  const rows = await db.select(pageColumns)
    .from(characters)
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .where(and(
      isNull(characters.deletedAt),
      eq(characters.isDraft, false),
      ...(type ? [eq(characters.experienceType, type)] : []),
      ...(includeOwned ? [or(
        eq(characters.isOfficial, true),
        eq(characters.isPublic, true),
        ...(userId ? [eq(characters.ownerId, userId)] : []),
      )] : [or(eq(characters.isOfficial, true), eq(characters.isPublic, true))]),
      genreMatch(characters.id, genres),
      ...(contactOnly ? [eq(contactProfiles.enabled, true)] : []),
      ...(cursor ? [or(
        lt(characters.createdAt, sql`${cursor.createdAt}::timestamptz`),
        and(eq(characters.createdAt, sql`${cursor.createdAt}::timestamptz`), lt(characters.id, cursor.id)),
      )] : []),
    ))
    .orderBy(desc(characters.createdAt), desc(characters.id))
    .limit(PAGE_SIZE + 1)
  const pageRows = rows.slice(0, PAGE_SIZE)
  const plays = await playCounts(pageRows.map(row => row.id))
  const last = pageRows.at(-1)
  return {
    items: pageRows.map(({ createdAtKey: _createdAtKey, ...row }) => card({ ...row, slug: row.slug ?? row.id }, { plays: plays.get(row.id) ?? 0 })),
    nextCursor: rows.length > PAGE_SIZE && last ? Buffer.from(JSON.stringify([last.createdAtKey, last.id])).toString('base64url') : null,
  }
}

/** 홈 = 모든 캐릭터(일반·미로). 로그인한 사람은 자기가 만든 비공개 캐릭터도 본다 — 미로 탭과 같은 규칙(2026-09-29). 장르를 고르면 그 장르만(2026-09-30). */
export const homePage = (userId: string | null, cursor: string | null = null, genres: string[] = []) => cardPage('reality', userId, cursor, true, genres)
/** 미로 = 앱 밖 연락(문자·전화)이 실제로 켜진 미로 캐릭터만(2026-09-30 요청, 예전 홈 R 스위치와 같은 기준). */
export const miroPage = (userId: string | null, cursor: string | null = null) => cardPage('reality', userId, cursor, true, [], true)

/** 인기 = 대화한 사람 수 순서로 6명. 장르를 고르면 그 장르 안에서 줄 세운다(2026-09-30). */
export async function popularHomeCards(genres: string[] = []): Promise<HomeCard[]> {
  if (indexedDiscoveryEnabled()) {
    const ranked = await rankedPopularIds(genreMatch(sql.raw('c.id'), genres))
    if (ranked.length === 0) return []
    const rows = await db.select(pageColumns)
      .from(characters)
      .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
      .where(and(
        inArray(characters.id, ranked.map(row => row.character_id)),
        or(eq(characters.isOfficial, true), eq(characters.isPublic, true)),
        eq(characters.isDraft, false), isNull(characters.deletedAt),
      ))
    const byId = new Map(rows.map(row => [row.id, row]))
    return ranked.flatMap(({ character_id, plays }) => {
      const row = byId.get(character_id)
      if (!row) return []
      const { createdAtKey: _createdAtKey, ...details } = row
      return [card({ ...details, slug: details.slug ?? details.id }, { plays })]
    })
  }
  const counts = db.select({ characterId: roleplaySessions.characterId, plays: sql<number>`count(distinct ${roleplaySessions.userId})::int`.as('plays') })
    .from(roleplaySessions).where(isNull(roleplaySessions.deletedAt)).groupBy(roleplaySessions.characterId).as('play_counts')
  const rows = await db.select({ ...pageColumns, plays: counts.plays })
    .from(characters)
    .innerJoin(counts, eq(counts.characterId, characters.id))
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .where(and(or(eq(characters.isOfficial, true), eq(characters.isPublic, true)), eq(characters.isDraft, false), isNull(characters.deletedAt), gt(counts.plays, 0), genreMatch(characters.id, genres)))
    .orderBy(desc(counts.plays), desc(characters.createdAt), desc(characters.id))
    .limit(6)
  return rows.map(({ createdAtKey: _createdAtKey, plays, ...row }) => card({ ...row, slug: row.slug ?? row.id }, { plays }))
}


/** 공개된 캐릭터 (초안·삭제 제외). 검색에서는 내 것을 별도 목록에 담으므로 중복을 피한다. */
async function publicCharacters(viewerId: string | null, limit: number, type: ExperienceType | null, includeOfficial = false): Promise<(OfficialCard & { isOfficial: boolean })[]> {
  const rows = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, role: characters.role, isOfficial: characters.isOfficial,
    occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
    accentA: characters.accentA, accentB: characters.accentB, genre: selectedWorldGenre,
    tagline: characters.tagline, startingContext: characters.startingContext, images: characters.images,
    contactEnabled: contactProfiles.enabled,
  })
    .from(characters)
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .where(and(
      eq(characters.isPublic, true), eq(characters.isDraft, false),
      isNull(characters.deletedAt),
      ...(!includeOfficial ? [eq(characters.isOfficial, false)] : []),
      ...(type ? [eq(characters.experienceType, type)] : []),
      ...(viewerId ? [ne(characters.ownerId, viewerId)] : []),
    ))
    .orderBy(desc(characters.createdAt))
    .limit(limit)
  return rows as (OfficialCard & { isOfficial: boolean })[]
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


/**
 * 한 유형의 전체 그리드. 주제로 나누지 않고 한 번에 보여준다.
 */
export async function discoverGrid(userId: string | null, type: ExperienceType): Promise<HomeCard[]> {
  // Fetch independent card collections together; aggregate counts once after IDs are known.
  const [officials, shared, mine] = await Promise.all([
    listOfficials(type),
    publicCharacters(userId, 60, type),
    userId ? db.select({
    id: characters.id, slug: characters.slug, name: characters.name, role: characters.role,
    occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
    accentA: characters.accentA, accentB: characters.accentB, genre: selectedWorldGenre,
    tagline: characters.tagline, startingContext: characters.startingContext, images: characters.images,
    contactEnabled: contactProfiles.enabled,
  })
    .from(characters)
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .where(and(eq(characters.ownerId, userId), eq(characters.experienceType, type), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))
    .limit(30) : Promise.resolve([]),
  ])
  const plays = await playCounts([...officials, ...shared].map(c => c.id))
  const all = officials.map(c => card(c, { plays: plays.get(c.id) ?? 0 }))
  const sharedCards = shared.map(c => card({ ...c, slug: c.slug ?? c.id }, { plays: plays.get(c.id) ?? 0 }))
  return [...all, ...sharedCards, ...(mine as OfficialCard[]).map((c) => card({ ...c, slug: c.slug ?? c.id }))]
}
