'use server'

import { redirect } from 'next/navigation'
import { and, eq, isNull, or } from 'drizzle-orm'
import {
  db, characters, worlds, roleplaySessions, worldStates, relationships,
} from '@miro/db'
import { requireUser } from '@/lib/auth'
import { track } from '@/lib/analytics/track'

/** 시작 관계 기본값. 캐릭터는 처음부터 사용자에게 호감을 보이지 않는다 (명세서 4.1). */
const DEFAULT_START = {
  trust: 15, attraction: 5, jealousy: 0,
  protectiveness: 15, emotionalDistance: 80, attachment: 5,
  stage: 'stranger' as const,
}

/**
 * 역할극 시작 (n18).
 *
 * 같은 캐릭터라도 사용자마다 별도 세션과 별도 World/Relationship 을 만든다.
 * 그래야 User A 의 토마스와 User B 의 토마스가 서로 다른 관계를 형성한다 (지시서 §0-D).
 *
 * 시작 상태는 DB 의 worlds 행에서 읽는다 — 시드 상수가 아니라.
 * 사용자가 만든 캐릭터도 같은 경로를 타야 하기 때문이다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function startRoleplay(key: string): Promise<void> {
  const user = await requireUser()

  // 상세와 같은 규칙: 공식이거나 공개했거나 내 것. 초안은 시작할 수 없다.
  const found = await db
    .select({
      characterId: characters.id,
      isOfficial: characters.isOfficial,
      worldId: worlds.id,
      worldLocation: worlds.location,
      startingTime: characters.startingTime,
      initialRelationship: characters.initialRelationship,
    })
    .from(characters)
    .innerJoin(worlds, eq(worlds.characterId, characters.id))
    .where(and(
      UUID.test(key) ? eq(characters.id, key) : eq(characters.slug, key),
      or(eq(characters.isOfficial, true), eq(characters.isPublic, true), eq(characters.ownerId, user.id)),
      eq(characters.isDraft, false),
      isNull(characters.deletedAt),
    ))
    .limit(1)

  const character = found[0]
  if (!character) throw new Error('CHARACTER_NOT_FOUND')

  const existing = await db
    .select({ id: roleplaySessions.id })
    .from(roleplaySessions)
    .where(and(
      eq(roleplaySessions.userId, user.id),
      eq(roleplaySessions.characterId, character.characterId),
      eq(roleplaySessions.status, 'active'),
      isNull(roleplaySessions.deletedAt),
    ))
    .limit(1)

  // 재진입은 저장된 상태 위에서 이어진다. 새 세션을 만들지 않는다.
  if (existing[0]) redirect(`/chat/${existing[0].id}`)

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx.insert(roleplaySessions).values({
      userId: user.id,
      characterId: character.characterId,
      worldId: character.worldId,
    }).returning({ id: roleplaySessions.id })

    const id = session!.id

    // 시작 시점의 세계 상태. 이후 턴마다 초기화되지 않고 누적된다.
    await tx.insert(worldStates).values({
      sessionId: id,
      currentLocation: character.worldLocation ?? '알 수 없는 장소',
      currentTime: character.startingTime,
    })

    // 캐릭터별 시작 관계. 값이 없으면 안전한 기본값으로 떨어진다.
    await tx.insert(relationships).values({
      sessionId: id,
      ...DEFAULT_START,
      ...character.initialRelationship,
    })

    return id
  })

  void track(user.id, 'character_selected', { characterId: character.characterId, official: character.isOfficial })
  void track(user.id, 'rp_started', { sessionId, characterId: character.characterId })
  // redirect 는 throw 로 동작하므로 반드시 트랜잭션 밖에서 호출한다.
  redirect(`/chat/${sessionId}`)
}
