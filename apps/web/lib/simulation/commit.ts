import { and, eq, sql } from 'drizzle-orm'
import {
  db, events, memories, messages, relationships, roleplaySessions,
  scenes, worldStates,
} from '@miro/db'
import { applyRelationshipDelta, buildSceneKey, nextCooldownTurn } from '@miro/domain'
import type { RelationshipState } from '@miro/domain'
import type { ValidatedTransition } from '@miro/engine'

export class StaleStateError extends Error {
  constructor() {
    super('simulation state changed underneath this turn')
    this.name = 'StaleStateError'
  }
}

export type CommitInput = {
  sessionId: string
  characterId: string
  turnIndex: number
  userInput: string
  responseText: string
  blocks: ValidatedTransition['blocks']
  transition: ValidatedTransition
  /** 읽어온 시점의 버전. 커밋 시점에 바뀌었으면 실패한다. */
  worldVersion: number
  relationshipVersion: number
  currentRelationship: RelationshipState
}

/**
 * 한 턴의 상태 변화를 하나의 트랜잭션으로 커밋한다.
 *
 * world_states / relationships 는 읽어온 version 과 일치할 때만 갱신된다.
 * 동시에 두 요청이 들어오면 뒤늦은 쪽이 StaleStateError 로 실패하고,
 * 호출자가 최신 상태를 다시 읽어 재시도한다 — 조용한 덮어쓰기를 막는다.
 */
export async function commitTurn(input: CommitInput): Promise<void> {
  await db.transaction(async (tx) => {
    const t = input.transition

    /* ---- world ---- */
    const worldPatch: Record<string, unknown> = {}
    if (t.worldDelta?.currentLocation) worldPatch.currentLocation = t.worldDelta.currentLocation
    if (t.worldDelta?.currentTime) worldPatch.currentTime = t.worldDelta.currentTime
    if (t.worldDelta?.worldStatus) worldPatch.worldStatus = t.worldDelta.worldStatus

    const worldUpdated = await tx.update(worldStates)
      .set({ ...worldPatch, version: input.worldVersion + 1, updatedAt: new Date() })
      .where(and(
        eq(worldStates.sessionId, input.sessionId),
        eq(worldStates.version, input.worldVersion),
      ))
      .returning({ id: worldStates.id })

    if (worldUpdated.length === 0) throw new StaleStateError()

    /* ---- relationship ---- */
    const next = applyRelationshipDelta(input.currentRelationship, t.relationshipDelta as never)
    const relUpdated = await tx.update(relationships)
      .set({
        trust: next.trust, attraction: next.attraction, jealousy: next.jealousy,
        protectiveness: next.protectiveness, emotionalDistance: next.emotionalDistance,
        attachment: next.attachment, stage: next.stage,
        version: input.relationshipVersion + 1, updatedAt: new Date(),
      })
      .where(and(
        eq(relationships.sessionId, input.sessionId),
        eq(relationships.version, input.relationshipVersion),
      ))
      .returning({ id: relationships.id })

    if (relUpdated.length === 0) throw new StaleStateError()

    /* ---- messages ---- */
    await tx.insert(messages).values([
      {
        sessionId: input.sessionId, role: 'user', kind: 'text',
        content: input.userInput, blocks: [], turnIndex: input.turnIndex,
      },
      {
        sessionId: input.sessionId, role: 'character', kind: 'text',
        content: input.responseText,
        blocks: input.blocks as never, turnIndex: input.turnIndex,
      },
    ])

    /* ---- event ---- */
    if (t.newEvent) {
      const [created] = await tx.insert(events).values({
        sessionId: input.sessionId,
        type: t.newEvent.candidate.type,
        status: 'active',
        context: t.newEvent.candidate.context,
        participantNpcIds: t.newEvent.candidate.participantNpcIds,
        continuationState: t.newEvent.candidate.context,
        cooldownUntilTurn: nextCooldownTurn(input.turnIndex),
        createdAtTurn: input.turnIndex,
      }).returning({ id: events.id })

      if (created) {
        await tx.update(worldStates)
          .set({
            activeEventIds: sql`${worldStates.activeEventIds} || ${JSON.stringify([created.id])}::jsonb`,
          })
          .where(eq(worldStates.sessionId, input.sessionId))
      }
    }

    /* ---- memories ---- */
    if (t.memories.length > 0) {
      await tx.insert(memories).values(t.memories.map((m) => ({
        sessionId: input.sessionId,
        characterId: input.characterId,
        type: m.type,
        content: m.content,
        importance: Math.round(m.importance * 100),
        persistence: Math.round(m.persistence * 100),
        confidence: Math.round(m.confidence * 100),
      })))
    }

    /* ---- scene ---- */
    if (t.sceneDelta) {
      const [current] = await tx.select().from(worldStates)
        .where(eq(worldStates.sessionId, input.sessionId)).limit(1)

      const spec = {
        location: t.sceneDelta.location ?? current?.currentLocation ?? '',
        time: t.sceneDelta.time ?? current?.currentTime ?? '',
        mood: t.sceneDelta.mood ?? '',
        weather: t.sceneDelta.weather ?? '',
      }
      const sceneKey = buildSceneKey(spec)

      // 같은 장면이면 새로 만들지 않는다 — 기존 asset 재사용.
      const [existing] = await tx.select({ id: scenes.id }).from(scenes)
        .where(and(eq(scenes.sessionId, input.sessionId), eq(scenes.sceneKey, sceneKey)))
        .limit(1)

      const sceneId = existing?.id ?? (await tx.insert(scenes)
        .values({ sessionId: input.sessionId, ...spec, sceneKey })
        .returning({ id: scenes.id }))[0]?.id

      if (sceneId) {
        await tx.update(worldStates).set({ currentSceneId: sceneId })
          .where(eq(worldStates.sessionId, input.sessionId))
      }
    }

    /* ---- session ---- */
    await tx.update(roleplaySessions)
      .set({ turnCount: input.turnIndex, lastInteractionAt: new Date() })
      .where(eq(roleplaySessions.id, input.sessionId))
  })
}
