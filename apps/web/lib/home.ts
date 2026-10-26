import { officialStartingContext } from './editorial/official-copy'
import { homeUnveilEnabled } from './home-mode'
import { adultCharacter } from '@miro/domain'
import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { db, characters, roleplaySessions, contactProfiles } from '@miro/db'
import { listOfficials, type ExperienceType, type OfficialCard } from './characters'
import { indexedDiscoveryEnabled, rankedPopularIds } from './search-index'
import { searchGenres, searchNeedle } from './search-params'
import { msg } from '@/lib/i18n'
import { genreValues } from './genres'
import { availableDiscoveryGroups, discoveryTagGroups, discoveryTagNeedle, type DiscoveryGroup } from './discovery-filters'

export type HomeCard = OfficialCard & {
  /** 실제로 이 캐릭터와 대화한 사람 수. 초기에는 0 이며 그때는 표시하지 않는다. */
  plays: number
  /** 카드 아래 한 줄. */
  caption: string | null
}

export type HomeRow = { key: string; title: string; items: HomeCard[]; /** 제목 아래 짧은 글(10/20). */ subtitle?: string }
export type CardPage = { items: HomeCard[]; nextCursor: string | null }

const PAGE_SIZE = 12
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const card = (c: OfficialCard, over: Partial<HomeCard> = {}): HomeCard =>
  ({ ...c, startingContext: officialStartingContext(c), caption: c.role, plays: 0, ...over })

const selectedWorldGenre = sql<string | null>`(select w.genre from worlds w where w.character_id = ${characters.id} order by w.id limit 1)`

/**
 * 첫 베타는 미로 캐릭터만 보여준다(2026-09-30, E-57). 캐릭터챗은 목록에 나오지 않고 이미 연 대화만 이어진다.
 */
export async function homeRows(): Promise<HomeRow[]> {
  const { items } = await homeCatalog(null)

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

function decodeCursor(value: string | null, sort: HomeSort) {
  if (!value) return null
  if (value.length > 160) throw new Error('INVALID_CURSOR')
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== (sort === 'latest' ? 2 : 4) || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string' || !UUID.test(parsed[1])) throw new Error('INVALID_CURSOR')
    if (sort !== 'latest' && (parsed[2] !== sort || !Number.isSafeInteger(parsed[3]) || parsed[3] < 0)) throw new Error('INVALID_CURSOR')
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed[0]) || Number.isNaN(Date.parse(parsed[0]))) throw new Error('INVALID_CURSOR')
    return { createdAt: parsed[0], id: parsed[1], score: sort === 'latest' ? 0 : parsed[3] as number }
  } catch { throw new Error('INVALID_CURSOR') }
}

/** 홈 칩(장르·관계)으로 거르기. 한 종류 안에서는 하나라도, 두 종류를 같이 고르면 둘 다 맞아야 한다. */
export type HomeSort = 'latest' | 'ranking' | 'reviews'
export type CardFilter = { genres?: string[]; relations?: string[]; tags?: string[]; query?: string; sort?: HomeSort; audience?: Audience }
/** 홈 위 고르기(10/20). 없으면 전체. */
export type Audience = 'female' | 'male'

/** 칩 값을 비교할 글자로 — 틀린 값이면 INVALID_GENRE. */
function chipNeedles(values: string[] = []) {
  const normalized = searchGenres(values)
  if (!normalized) throw new Error('INVALID_GENRE')
  return normalized.map(searchNeedle)
}

/** `text` 가 칩 글자 중 하나라도 품는다 — 띄어쓰기·대소문자는 무시한다. */
const containsAny = (text: SQL, needles: string[]) =>
  sql.join(needles.map(needle => sql`position(${needle} in lower(regexp_replace(${text}, '[[:space:]]+', '', 'g'))) > 0`), sql` or `)

/**
 * 홈 장르 칩(2026-09-30, 예전 검색 페이지의 장르 버튼) — 세계 중 하나라도 고른 장르 중 하나를 품으면 맞는다.
 * worlds.genre 는 '현대 로맨스 · 일상' 처럼 붙어 오므로 '로맨스' 칩이 이것도 잡는다(2026-09-30 요청).
 */
function genreMatch(characterId: SQLWrapper, genres?: string[]): SQL | undefined {
  const needles = chipNeedles(genres)
  if (needles.length === 0) return undefined
  return sql`exists (select 1 from worlds w where w.character_id = ${characterId} and (${containsAny(sql.raw('w.genre'), needles)}))`
}

/** 홈 관계 칩(2026-09-30) — 만들기에서 고른 관계(relationship_keywords) 중 하나가 칩 글자를 품으면 맞는다. '상사' 는 '직장 상사' 도 잡는다. */
function relationMatch(relations?: string[]): SQL | undefined {
  const needles = chipNeedles(relations)
  if (needles.length === 0) return undefined
  return sql`exists (select 1 from jsonb_array_elements_text(${characters.relationshipKeywords}) as keyword(value) where ${containsAny(sql.raw('keyword.value'), needles)})`
}

function discoveryMatch(tags: string[] = []): SQL | undefined {
  const groups = discoveryTagGroups(tags)
  const catalogText = sql`concat_ws(' ', ${characters.name}, ${characters.role}, ${characters.occupation}, ${characters.tagline}, ${characters.relationshipKeywords}::text, ${selectedWorldGenre})`
  return and(...groups.map(group => sql`(${containsAny(catalogText, [...new Set(group.flatMap(tag => discoveryTagNeedle(tag).split('/').map(searchNeedle)))])})`))
}

async function cardPage(type: ExperienceType | null, userId: string | null, cursorValue: string | null, includeOwned = false, filter: CardFilter = {}, contactOnly = false, all = false): Promise<CardPage> {
  const unveil = await homeUnveilEnabled(userId)
  const sort = filter.sort ?? 'latest'
  const cursor = decodeCursor(cursorValue, sort)
  // 랭킹은 중복 없는 대화 인원, 후기는 공개된 원글 수(답글·숨김 제외)로 집계한다.
  const score = sort === 'ranking'
    ? sql<number>`(select count(distinct s.user_id)::int from roleplay_sessions s where s.character_id = ${characters.id} and s.deleted_at is null)`
    : sort === 'reviews'
      ? sql<number>`(select count(*)::int from character_comments cc where cc.character_id = ${characters.id} and cc.parent_id is null and cc.hidden_at is null)`
      : sql<number>`0`
  const afterDate = cursor ? or(
    lt(characters.createdAt, sql`${cursor.createdAt}::timestamptz`),
    and(eq(characters.createdAt, sql`${cursor.createdAt}::timestamptz`), lt(characters.id, cursor.id)),
  ) : undefined
  const query = db.select({ ...pageColumns, sortScore: score })
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
      genreMatch(characters.id, filter.genres),
      relationMatch(filter.relations),
      discoveryMatch(filter.tags),
      ...(filter.audience ? [eq(characters.audience, filter.audience)] : []),
      ...(searchNeedle(filter.query ?? '') ? [containsAny(sql`concat_ws(' ', ${characters.name}, ${characters.role}, ${characters.tagline}, ${characters.relationshipKeywords}::text, ${selectedWorldGenre})`, [searchNeedle(filter.query ?? '')])] : []),
      ...(contactOnly ? [eq(contactProfiles.enabled, true)] : []),
      ...(cursor ? [sort === 'latest' ? afterDate : or(lt(score, cursor.score), and(eq(score, cursor.score), afterDate))] : []),
    ))
    .orderBy(...(sort === 'latest' ? [] : [desc(score)]), desc(characters.createdAt), desc(characters.id))
    .$dynamic()
  const rows = await (all ? query : query.limit(PAGE_SIZE + 1))
  let pageRows = all ? rows : rows.slice(0, PAGE_SIZE)
  if (unveil && pageRows.length) {
    const eligible = await db.select({ id: characters.id, age: characters.age, role: characters.role, occupation: characters.occupation, socialPosition: characters.socialPosition, tagline: characters.tagline }).from(characters)
      .where(and(inArray(characters.id, pageRows.map(c => c.id)), sql`not coalesce((select vi.has_real_person_reference from character_visual_identities vi where vi.character_id = ${characters.id} and vi.is_active = true order by vi.version desc limit 1), false)`))
    const allowed = new Set(eligible.filter(adultCharacter).map(c => c.id))
    pageRows = pageRows.filter(c => allowed.has(c.id))
  }
  const plays = await playCounts(pageRows.map(row => row.id))
  const last = rows.slice(0, PAGE_SIZE).at(-1)
  return {
    items: pageRows.map(({ createdAtKey: _createdAtKey, sortScore: _sortScore, ...row }) => card({ ...row, slug: row.slug ?? row.id }, { plays: plays.get(row.id) ?? 0 })),
    nextCursor: !all && rows.length > PAGE_SIZE && last ? Buffer.from(JSON.stringify(sort === 'latest' ? [last.createdAtKey, last.id] : [last.createdAtKey, last.id, sort, last.sortScore])).toString('base64url') : null,
  }
}

/** 홈 = 미로 캐릭터(첫 베타는 캐릭터챗을 싣지 않는다, E-57). 로그인한 사람은 자기가 만든 비공개 캐릭터도 본다(2026-09-29). 장르·관계 칩으로 거른다(2026-09-30). */
export const homePage = (userId: string | null, cursor: string | null = null, filter: CardFilter = {}) => cardPage('reality', userId, cursor, true, filter)
/** 홈·검색은 더 보기 없이, 접근 가능한 캐릭터 전체를 현재 정렬 기준으로 보여준다. */
export const homeCatalog = (userId: string | null, filter: CardFilter = {}) => cardPage('reality', userId, null, true, filter, false, true)
/** 미로 = 앱 밖 연락(문자·전화)이 실제로 켜진 미로 캐릭터만(2026-09-30 요청, 예전 홈 R 스위치와 같은 기준). */
export const miroPage = (userId: string | null, cursor: string | null = null) => cardPage('reality', userId, cursor, true, {}, true)
export const miroCatalog = (userId: string | null) => cardPage('reality', userId, null, true, {}, true, true)

/**
 * 홈 섹션(10/19, 위프·베이비챗형): 인기 순위 + 장르별 줄. 목록은 homeCatalog(랭킹순 — 대화 인원, 같으면 최신) 한 번만 읽고 나눈다.
 * 장르 줄은 worlds.genre 의 '·' 조각 중 카드가 3개 이상인 것, 많은 순으로 6줄. 섹션끼리 캐릭터가 겹치지 않는다(10/19).
 */
export async function homeSections(userId: string | null, audience?: Audience): Promise<{ ranking: HomeCard[]; genres: HomeRow[]; filters: DiscoveryGroup[] }> {
  // 10/19: 최근에 만든 캐릭터가 앞에 오게(사용자 요청) — 대화 수가 쌓이기 전까지 최신순.
  const { items } = await homeCatalog(userId, { sort: 'latest', audience })
  // 10/19: 한 캐릭터는 한 섹션에만(사용자 요청). 인기 줄이 먼저 10명을 가져가고, 나머지는 자기 장르 중 가장 좁은(캐릭터가 적은) 장르 줄 하나에만 들어간다.
  const ranking = items.slice(0, 10)
  const rest = items.slice(10)
  const counts = new Map<string, number>()
  for (const c of rest) for (const g of new Set(genreValues(c.genre))) counts.set(g, (counts.get(g) ?? 0) + 1)
  const buckets = new Map<string, HomeCard[]>()
  for (const c of rest) {
    const gs = [...new Set(genreValues(c.genre))].filter(g => (counts.get(g) ?? 0) >= 3)
    if (!gs.length) continue
    const g = gs.sort((a, b) => (counts.get(a)! - counts.get(b)!) || a.localeCompare(b))[0]!
    buckets.set(g, [...(buckets.get(g) ?? []), c])
  }
  const genres = [...buckets].filter(([, cs]) => cs.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 6)
    .map(([g, cs]) => ({ key: g, title: g, items: shuffle(cs) }))
  // 10/20: 줄 안의 순서는 들어올 때마다 섞는다(사용자 요청) — 어느 줄에 들어가는지는 그대로.
  return { ranking: shuffle(ranking), genres, filters: availableDiscoveryGroups(items) }
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

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
