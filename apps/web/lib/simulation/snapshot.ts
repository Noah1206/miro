import { characterContext, conversationContext } from './character-context'
import { memoryRetriever } from '@/lib/ai/memory'
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import {
  db, characters, characterVisualIdentities, events, memories, messages, npcs, realityContacts, relationships,
  callSessions, roleplaySessions, scenes, userSettings, worldStates, worlds,
} from '@miro/db'
import { DEFAULT_CHARACTER_STATE, describeRoutine, localClock, type CharacterState } from '@miro/domain'
import { characterAvailability } from '@/lib/reality/routine'
import { POLICY } from '@miro/config'
import type { SimulationSnapshot } from '@miro/engine'

export type LoadedSession = {
  snapshot: SimulationSnapshot
  sessionId: string
  characterId: string
  characterName: string
  characterPhoto?: string | null
  characterStatus: string | null
  /** 운영 제한. 새 턴/미디어를 거부한다. */
  restricted: boolean
  /** chat 이면 선연락·사진·통화·Live 가 이 세션에서 열리지 않는다. */
  experienceType: 'chat' | 'reality'
  lastInteractionAt: Date
}

const RECENT_RESOLVED_EVENT_LIMIT = 24

/**
 * 재진입 시 마지막 메시지가 아니라 Simulation State 전체를 복구한다.
 * 본인 세션만 조회 가능하다.
 */
export async function loadSession(
  sessionId: string,
  userId: string,
  input = '',
): Promise<LoadedSession | null> {
  const rows = await db
    .select({ session: roleplaySessions, character: characters, world: worldStates,
              relationship: relationships, worldSetting: worlds.worldSetting, worldGenre: worlds.genre })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(worldStates, eq(worldStates.sessionId, roleplaySessions.id))
    .innerJoin(relationships, eq(relationships.sessionId, roleplaySessions.id))
    .leftJoin(worlds, eq(worlds.id, roleplaySessions.worldId))
    .where(and(
      eq(roleplaySessions.id, sessionId),
      eq(roleplaySessions.userId, userId),
      isNull(roleplaySessions.deletedAt),
    ))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const [activeEvents, recentlyResolvedEvents, coolingEvents, sessionNpcs, sessionMemories, currentScene, recent, recentContacts, visual, owner, calls] = await Promise.all([
    db.select().from(events)
      .where(and(eq(events.sessionId, sessionId), inArray(events.status, ['active', 'escalated']))),
    db.select().from(events)
      .where(and(eq(events.sessionId, sessionId), eq(events.status, 'resolved')))
      .orderBy(sql`${events.resolvedAtTurn} DESC NULLS LAST`, desc(events.id))
      .limit(RECENT_RESOLVED_EVENT_LIMIT),
    db.selectDistinctOn([events.type]).from(events)
      .where(and(eq(events.sessionId, sessionId), eq(events.status, 'resolved'), gt(events.cooldownUntilTurn, row.session.turnCount)))
      .orderBy(events.type, desc(events.cooldownUntilTurn), desc(events.id)),
    db.select().from(npcs).where(and(eq(npcs.sessionId, sessionId), eq(npcs.isActive, true))),
    memoryRetriever.retrieve({ sessionId, userId, query: input, limit: 24 }),
    row.world.currentSceneId
      ? db.select().from(scenes).where(eq(scenes.id, row.world.currentSceneId)).limit(1)
      : Promise.resolve([]),
    db.select().from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.hiddenAt), inArray(messages.role, ['user', 'character', 'narrator', 'npc'])))
      .orderBy(desc(messages.turnIndex), desc(messages.createdAt), desc(messages.id))
      .limit(24),
    db.select({ channel: realityContacts.channel, sentAt: realityContacts.sentAt })
      .from(realityContacts)
      .where(and(eq(realityContacts.sessionId, sessionId), eq(realityContacts.status, 'sent')))
      .orderBy(desc(realityContacts.sentAt)).limit(3),
    db.select().from(characterVisualIdentities)
      .where(and(eq(characterVisualIdentities.characterId, row.character.id), eq(characterVisualIdentities.isActive, true)))
      .orderBy(desc(characterVisualIdentities.version), desc(characterVisualIdentities.createdAt), desc(characterVisualIdentities.id)).limit(1),
    // 현실 시계는 사용자 시간대로 — 캐릭터가 "지금 몇 시인지" 알아야 하루의 때에 맞게 말한다.
    db.select({ timeZone: userSettings.timeZone }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    // 최근 통화 — 못 받은 전화, 끊은 전화를 캐릭터가 안다. 울리는 중인 것은 아직 사실이 아니다.
    db.select().from(callSessions).where(and(eq(callSessions.sessionId, sessionId), inArray(callSessions.status, ['ended', 'missed', 'declined', 'unanswered'])))
      .orderBy(desc(callSessions.createdAt)).limit(3),
  ])
  const timeZone = owner[0]?.timeZone ?? POLICY.reality.defaultTimeZone
  const now = new Date()
  // 생활 리듬은 미로 캐릭터의 것이다(연락 프로필이 있어야 한다).
  const availability = row.character.experienceType === 'reality' ? await characterAvailability(row.character.id, now, timeZone) : null

  const c = row.character
  const snapshot: SimulationSnapshot = {
    character: characterContext(c, visual[0]),
    world: row.world as never,
    worldSetting: row.worldSetting,
    worldGenre: row.worldGenre,
    relationship: row.relationship as never,
    scene: (currentScene[0] ?? null) as never,
    memories: sessionMemories,
    recentMessages: conversationContext(recent.reverse()),
    activeEvents: activeEvents as never,
    recentlyResolvedEvents: [...new Map([...recentlyResolvedEvents, ...coolingEvents].map((event) => [event.id, event])).values()] as never,
    activeNpcs: sessionNpcs as never,
    recentRealityContacts: recentContacts
      .filter((c): c is { channel: string; sentAt: Date } => c.sentAt !== null),
    turnCount: row.session.turnCount,
    experienceType: c.experienceType,
    characterState: { ...DEFAULT_CHARACTER_STATE, ...(row.session.characterState as Partial<CharacterState>) },
    clock: localClock(now, timeZone),
    routine: availability ? describeRoutine(availability.routine, availability) : null,
    recentCalls: calls.map((c) => {
      const when = localClock(c.endedAt ?? c.createdAt, timeZone).label
      const kind = c.channel === 'voice' ? '음성통화' : '영상통화'
      const what = c.status === 'unanswered' ? `사용자가 걸었지만 내가 받지 못함(${c.reason ?? '바쁜'} 중)`
        : c.status === 'missed' ? '내가 걸었지만 사용자가 받지 않음'
        : c.status === 'declined' ? '내가 걸었지만 사용자가 끊음'
        : `${c.direction === 'incoming' ? '내가 건' : '사용자가 건'} ${kind} ${Math.round((c.durationSec ?? 0) / 60)}분`
      return `${when} · ${what}`
    }),
  }

  return {
    snapshot,
    sessionId,
    characterId: c.id,
    characterName: c.name,
    characterPhoto: c.images[0] ?? null,
    characterStatus: row.session.characterStatus,
    restricted: row.session.restrictedAt !== null,
    experienceType: c.experienceType,
    lastInteractionAt: row.session.lastInteractionAt,
  }
}

export { inArray }
