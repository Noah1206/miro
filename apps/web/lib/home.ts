import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db, characters, roleplaySessions, contactProfiles } from '@miro/db'
import { listOfficials, type ExperienceType, type OfficialCard } from './characters'
import { indexedDiscoveryEnabled, indexedSearchMatch, rankedPopularIds } from './search-index'
import { searchGenres, searchNeedle } from './search-params'

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
 * 홈은 공개된 chat·reality 캐릭터를 모두 보여준다. /miro 와 /home/search 는 유형별 목록이다.
 */
export async function homeRows(): Promise<HomeRow[]> {
  const { items } = await homePage()

  const rows: HomeRow[] = [
    { key: 'shared', title: '전체 이야기', items },
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

function decodeCursor(value: string | null, scope?: string) {
  if (!value) return null
  if (value.length > 160) throw new Error('INVALID_CURSOR')
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== (scope ? 3 : 2) || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string' || !UUID.test(parsed[1]) || (scope && parsed[2] !== scope)) throw new Error('INVALID_CURSOR')
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed[0]) || Number.isNaN(Date.parse(parsed[0]))) throw new Error('INVALID_CURSOR')
    return { createdAt: parsed[0], id: parsed[1] }
  } catch { throw new Error('INVALID_CURSOR') }
}

async function cardPage(type: ExperienceType | null, userId: string | null, cursorValue: string | null, query = '', includeOwned = false, searchMode = false, tag: string | null = null, genres: string[] = []): Promise<CardPage> {
  const needle = searchNeedle(query)
  const tagNeedle = tag === null ? null : searchNeedle(tag.replace(/^#/, ''))
  const normalizedGenres = searchGenres(genres)
  if (!normalizedGenres) throw new Error('INVALID_GENRE')
  const genreNeedles = normalizedGenres.map(searchNeedle)
  const scope = searchMode ? createHash('sha256').update(JSON.stringify([type ?? 'all', needle, tagNeedle ?? '', genreNeedles])).digest('base64url').slice(0, 16) : undefined
  const cursor = decodeCursor(cursorValue, scope)
  if (searchMode && ((!needle && !tagNeedle && genreNeedles.length === 0) || tagNeedle === '')) {
    if (cursor) throw new Error('INVALID_CURSOR')
    return { items: [], nextCursor: null }
  }
  const matches = (genre: SQL) => sql`position(${needle} in lower(regexp_replace(concat_ws(' ', ${characters.name}, ${characters.tagline}, ${characters.occupation}, ${characters.role}, ${genre}, array_to_string(ARRAY(select jsonb_array_elements_text(${characters.relationshipKeywords})), ' ')), '[[:space:]]+', '', 'g'))) > 0`
  const tagMatch = tagNeedle ? sql`(
    exists (select 1 from worlds w, unnest(string_to_array(w.genre, '·')) as genre_tag(value)
      where w.character_id = ${characters.id} and lower(regexp_replace(genre_tag.value, '[[:space:]]+', '', 'g')) = ${tagNeedle})
    or exists (select 1 from jsonb_array_elements_text(${characters.relationshipKeywords}) as keyword(value)
      where lower(regexp_replace(keyword.value, '[[:space:]]+', '', 'g')) = ${tagNeedle})
  )` : undefined
  const genreMatch = genreNeedles.length ? sql`exists (
    select 1 from worlds w, unnest(string_to_array(w.genre, '·')) as genre_tag(value)
    where w.character_id = ${characters.id} and lower(regexp_replace(genre_tag.value, '[[:space:]]+', '', 'g')) in (${sql.join(genreNeedles.map(value => sql`${value}`), sql`, `)})
  )` : undefined
  const search = needle ? (indexedDiscoveryEnabled() ? indexedSearchMatch(needle) : sql`(
    exists (select 1 from worlds w where w.character_id = ${characters.id} and ${matches(sql.raw('w.genre'))})
    or (not exists (select 1 from worlds w where w.character_id = ${characters.id}) and ${matches(sql`null::text`)})
  )`) : undefined
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
      ...(search ? [search] : []),
      ...(tagMatch ? [tagMatch] : []),
      ...(genreMatch ? [genreMatch] : []),
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
    nextCursor: rows.length > PAGE_SIZE && last ? Buffer.from(JSON.stringify([last.createdAtKey, last.id, ...(scope ? [scope] : [])])).toString('base64url') : null,
  }
}

export const homePage = (cursor: string | null = null) => cardPage(null, null, cursor)
export const miroPage = (userId: string | null, cursor: string | null = null) => cardPage('reality', userId, cursor, '', true)
export const searchPage = (userId: string | null, query: string, cursor: string | null = null, tag: string | null = null, genres: string[] = []) => cardPage(null, userId, cursor, query, true, true, tag, genres)

export async function popularHomeCards(): Promise<HomeCard[]> {
  if (indexedDiscoveryEnabled()) {
    const ranked = await rankedPopularIds()
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
    .where(and(or(eq(characters.isOfficial, true), eq(characters.isPublic, true)), eq(characters.isDraft, false), isNull(characters.deletedAt), gt(counts.plays, 0)))
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
 * chat 은 /home/search(검색), reality 는 /miro 가 쓴다 — 같은 카드, 다른 대상.
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
