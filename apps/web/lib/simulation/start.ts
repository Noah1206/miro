import { and, eq, isNull, or } from 'drizzle-orm'
import { db, characters, messages, relationships, roleplaySessions, worldStates, worlds } from '@miro/db'

/** 시작 관계 기본값. 캐릭터는 처음부터 사용자에게 호감을 보이지 않는다 (명세서 4.1). */
const DEFAULT_START = {
  trust: 15, attraction: 5, jealousy: 0,
  protectiveness: 15, emotionalDistance: 80, attachment: 5,
  stage: 'stranger' as const,
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type StartedSession = { sessionId: string; characterId: string; isOfficial: boolean; created: boolean }

/**
 * 역할극 세션 생성 (또는 재진입).
 *
 * 같은 캐릭터라도 사용자마다 별도 세션과 별도 World/Relationship 을 만든다 — User A 의 토마스와
 * User B 의 토마스는 서로 다른 관계를 형성한다. 시작 상태는 DB 의 worlds/characters 행에서 읽는다.
 * 사용자가 만든 캐릭터도, 알파의 게스트 계정도 같은 경로를 탄다.
 */
export async function createRoleplaySession(
  userId: string, key: string,
  opts: { outputStyle?: 'messenger' | 'balanced' | 'narrative'; opening?: string } = {},
): Promise<StartedSession> {
  const found = await db
    .select({
      characterId: characters.id, isOfficial: characters.isOfficial, worldId: worlds.id,
      worldLocation: worlds.location, startingTime: characters.startingTime,
      initialRelationship: characters.initialRelationship,
    })
    .from(characters)
    .innerJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(
      UUID.test(key) ? eq(characters.id, key) : eq(characters.slug, key),
      or(eq(characters.isOfficial, true), eq(characters.isPublic, true), eq(characters.ownerId, userId)),
      eq(characters.isDraft, false),
      isNull(characters.deletedAt),
    ))
    .limit(1)
  const character = found[0]
  if (!character) throw new Error('CHARACTER_NOT_FOUND')

  const existing = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .where(and(
      eq(roleplaySessions.userId, userId), eq(roleplaySessions.characterId, character.characterId),
      eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt),
    )).limit(1)
  // 재진입은 저장된 상태 위에서 이어진다. 새 세션을 만들지 않는다.
  if (existing[0]) return { sessionId: existing[0].id, characterId: character.characterId, isOfficial: character.isOfficial, created: false }

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx.insert(roleplaySessions).values({
      userId, characterId: character.characterId, worldId: character.worldId,
      ...(opts.outputStyle ? { outputStyle: opts.outputStyle } : {}),
    }).returning({ id: roleplaySessions.id })
    const id = session!.id
    // 시작 시점의 세계 상태. 이후 턴마다 초기화되지 않고 누적된다.
    await tx.insert(worldStates).values({
      sessionId: id, currentLocation: character.worldLocation ?? '알 수 없는 장소', currentTime: character.startingTime,
    })
    // 캐릭터별 시작 관계. 값이 없으면 안전한 기본값으로 떨어진다.
    await tx.insert(relationships).values({ sessionId: id, ...DEFAULT_START, ...character.initialRelationship })
    // 캐릭터가 먼저 보낸 첫 마디 — 있으면 대화가 이미 시작된 상태로 들어간다.
    if (opts.opening) {
      await tx.insert(messages).values({ sessionId: id, role: 'character', kind: 'text', content: opts.opening, blocks: [], turnIndex: 0 })
    }
    return id
  })
  return { sessionId, characterId: character.characterId, isOfficial: character.isOfficial, created: true }
}
