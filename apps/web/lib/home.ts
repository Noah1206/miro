import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, characters, relationships, roleplaySessions, worldStates } from '@miro/db'
import { stageLabel } from '@miro/domain'
import { listOfficials, type OfficialCard } from './characters'

export type HomeCard = OfficialCard & {
  /** 진행 중인 역할극이면 그 세션으로 바로 들어간다. */
  sessionId: string | null
  /** 카드 아래 한 줄. 이어지는 인연이면 지금 어디에 있는지, 아니면 역할. */
  caption: string | null
}

export type HomeRow = { key: string; title: string; items: HomeCard[] }

const card = (c: OfficialCard, over: Partial<HomeCard> = {}): HomeCard =>
  ({ ...c, sessionId: null, caption: c.role, ...over })

/** 행 분류는 캐릭터의 관계 키워드로 한다 — 코드에 이름을 박아두지 않는다. */
const byKeyword = (c: HomeCard, keys: string[]): boolean =>
  c.relationshipKeywords.some((k) => keys.includes(k))

/**
 * 홈은 주제를 가진 가로 스크롤 행들이다 (명세서 2.1 표시).
 * 빈 행은 내보내지 않는다 — 처음 온 사람에게는 ORIGINALS 한 줄만 보인다.
 */
export async function homeRows(userId: string | null): Promise<HomeRow[]> {
  const officials = await listOfficials()
  // 로그인 전에는 보여줄 개인 기록이 없다 — ORIGINALS 한 줄로 시작한다.
  if (!userId) {
    const all = officials.map((o) => card(o))
    return [
      { key: 'originals', title: 'MIRO ORIGINALS', items: all },
      { key: 'slow', title: '천천히 열리는 사람', items: all.filter((c) => byKeyword(c, ['거리를 두는', '서서히 열리는', '말을 아끼는'])) },
      { key: 'dangerous', title: '위험한 거리', items: all.filter((c) => byKeyword(c, ['위험한', '지켜보는', '오래된 비밀', '선을 넘는 순간'])) },
    ].filter((r) => r.items.length > 0)
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
    sessionId: r.session.id,
    caption: r.session.characterStatus
      ?? `${r.world.currentLocation} · ${stageLabel(r.rel.stage as never, r.rel as never)}`,
  }))

  // 내가 만든 사람 — 아직 시작하지 않은 것까지 포함한다.
  const mine = await db.select({
    id: characters.id, slug: characters.slug, name: characters.name, role: characters.role,
    occupation: characters.occupation, relationshipKeywords: characters.relationshipKeywords,
    accentA: characters.accentA, accentB: characters.accentB,
  })
    .from(characters)
    .where(and(eq(characters.ownerId, userId), isNull(characters.deletedAt)))
    .orderBy(desc(characters.createdAt))
    .limit(12)

  const all = officials.map((o) => card(o))

  const rows: HomeRow[] = [
    { key: 'continuing', title: '이어서 대화하기', items: continuing },
    { key: 'originals', title: 'MIRO ORIGINALS', items: all },
    // 캐릭터가 많지 않으므로 주제로 갈라 보여준다 — 같은 사람이라도 다른 이유로 눈에 띈다.
    { key: 'slow', title: '천천히 열리는 사람', items: all.filter((c) => byKeyword(c, ['거리를 두는', '서서히 열리는', '말을 아끼는'])) },
    { key: 'dangerous', title: '위험한 거리', items: all.filter((c) => byKeyword(c, ['위험한', '지켜보는', '오래된 비밀', '선을 넘는 순간'])) },
    {
      key: 'mine',
      title: '내가 만든 사람',
      items: (mine as OfficialCard[]).map((c) => card({ ...c, slug: c.slug ?? c.id })),
    },
  ]
  return rows.filter((r) => r.items.length > 0)
}
