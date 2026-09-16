import { and, desc, eq, inArray, isNull, sql, ne } from 'drizzle-orm'
import { db, characters, relationships, roleplaySessions, worldStates, worlds, messages, realityContacts, contactProfiles } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { listOfficials, type ExperienceType, type OfficialCard } from './characters'

export type HomeCard = OfficialCard & {
  lastMessage?: string | null
  unread?: number
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
 * Home supplies distinct continuing, official and community collections for the compact feed.
 * 홈은 일반 캐릭터챗(chat)만 다룬다. 미로(reality) 캐릭터는 /miro 가 보여준다.
 */
export async function homeRows(userId: string | null): Promise<HomeRow[]> {
  const [officials, shared] = await Promise.all([
    listOfficials('chat'),
    userId ? publicCharacters(userId, 12, 'chat') : Promise.resolve([]),
  ])
  const plays = await playCounts([...officials, ...shared].map(c => c.id))
  const withPlays = (c: OfficialCard) => card(c, { plays: plays.get(c.id) ?? 0 })
  // 로그인 전에는 보여줄 개인 기록이 없다 — ORIGINALS 한 줄로 시작한다.
  if (!userId) {
    const all = officials.map(withPlays)
    return [{ key: 'originals', title: 'MIRO ORIGINALS', items: all }]
  }

  const active = await db.select({ contactEnabled: contactProfiles.enabled, session: roleplaySessions, character: characters, world: worldStates, rel: relationships,
    lastMessage: sql<string | null>`(select m.content from ${messages} m where m.session_id = ${roleplaySessions.id} and m.kind in ('text', 'reality_message') order by m.created_at desc limit 1)`,
    unread: sql<number>`(select count(*)::int from ${realityContacts} rc where rc.session_id = ${roleplaySessions.id} and rc.status = 'sent')`,
  })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .innerJoin(relationships, eq(relationships.sessionId, roleplaySessions.id))
    .where(and(eq(roleplaySessions.userId, userId), eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt),
      // 미로 캐릭터와의 대화는 홈에 섞지 않는다. /archive 는 둘 다 보존한다.
      eq(characters.experienceType, 'chat')))
    .orderBy(desc(roleplaySessions.lastInteractionAt))
    .limit(12)

  const continuingPlays = await playCounts(active.map(r => r.character.id))
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
    startingContext: r.character.startingContext,
    images: r.character.images,
    contactEnabled: r.contactEnabled,
    plays: continuingPlays.get(r.character.id) ?? 0,
    sessionId: r.session.id,
    lastMessage: r.lastMessage, unread: r.unread,
    caption: r.session.characterStatus
      ?? `${r.world.currentLocation} · ${stageLabel(r.rel.stage as never, r.rel as never)}`,
  }))

  const all = officials.map(withPlays)
  const sharedPlays = plays

  const rows: HomeRow[] = [
    { key: 'continuing', title: '이어서 대화하기', items: continuing },
    { key: 'originals', title: 'MIRO ORIGINALS', items: all },
    {
      // 다른 사람이 공개한 캐릭터. 내 콘텐츠 관리는 별도 화면에서 한다.
      key: 'shared',
      title: '사람들이 만든 사람',
      items: shared.map((c) => card({ ...c, slug: c.slug ?? c.id }, { plays: sharedPlays.get(c.id) ?? 0 })),
    },

  ]
  return rows.filter((r) => r.items.length > 0)
}


/** 다른 사람이 공개한 캐릭터 (초안·삭제 제외, 내 것 제외). 최근 것부터. 유형은 호출자가 정한다. */
async function publicCharacters(viewerId: string | null, limit: number, type: ExperienceType): Promise<OfficialCard[]> {
  const rows = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, role: characters.role,
    occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
    accentA: characters.accentA, accentB: characters.accentB, genre: worlds.genre,
    tagline: characters.tagline, startingContext: characters.startingContext, images: characters.images,
    contactEnabled: contactProfiles.enabled,
  })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .where(and(
      eq(characters.isPublic, true), eq(characters.isOfficial, false), eq(characters.isDraft, false),
      eq(characters.experienceType, type),
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
    accentA: characters.accentA, accentB: characters.accentB, genre: worlds.genre,
    tagline: characters.tagline, startingContext: characters.startingContext, images: characters.images,
    contactEnabled: contactProfiles.enabled,
  })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
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
