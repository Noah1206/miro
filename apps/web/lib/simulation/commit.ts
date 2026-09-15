import { and, eq, sql } from 'drizzle-orm'
import {
  db, events, memories, messages, npcs, relationships, roleplaySessions,
  scenes, worldStates, usageLedger, conversationRequests,
} from '@miro/db'
import {
  applyRelationshipDelta, buildSceneKey, dedupeCandidates, nextCooldownTurn, pruneMemories,
} from '@miro/domain'
import { POLICY } from '@miro/config'
import type { CharacterState, RelationshipState } from '@miro/domain'
import type { ValidatedTransition } from '@miro/engine'

export class StaleStateError extends Error {
  constructor() {
    super('simulation state changed underneath this turn')
    this.name = 'StaleStateError'
  }
}

export type CommitInput = {
  sessionId: string
  reservationId?: string
  requestId?: string
  requestResult?: unknown
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
  /** 중복 기억 판정을 위한 기존 기억. */
  existingMemories: Array<{ content: string; importance: number; persistence: number }>
  /** 이번 턴 이후의 캐릭터 상태. runTurn 이 만든다. */
  characterState?: CharacterState
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
    if (input.requestId) {
      const [r] = await tx.select().from(conversationRequests).where(eq(conversationRequests.id, input.requestId)).for('update')
      if (!r || r.status !== 'pending' || r.leaseUntil < new Date()) throw new StaleStateError()
      await tx.update(conversationRequests).set({ status: 'completed', result: input.requestResult }).where(eq(conversationRequests.id, input.requestId))
    }
    if (input.reservationId) {
      const [r] = await tx.update(usageLedger).set({ status: 'committed' }).where(and(eq(usageLedger.id, input.reservationId), eq(usageLedger.status, 'reserved'))).returning({ id: usageLedger.id })
      if (!r) throw new StaleStateError()
    }
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

    /* ---- event updates ---- */
    for (const u of t.eventUpdates) {
      const patch: Record<string, unknown> = { status: u.status }
      if (u.continuationState) patch.continuationState = u.continuationState
      if (u.status === 'resolved' || u.status === 'cancelled') {
        patch.resolvedAtTurn = input.turnIndex
        // 해결된 사건은 쿨다운이 시작된다 — 다음 턴에 곧바로 재발하지 않는다.
        patch.cooldownUntilTurn = nextCooldownTurn(input.turnIndex)
      }
      if (u.consequence) {
        patch.consequences = sql`${events.consequences} || ${JSON.stringify([u.consequence])}::jsonb`
      }

      await tx.update(events).set(patch)
        .where(and(eq(events.id, u.eventId), eq(events.sessionId, input.sessionId)))
    }

    // 해결/취소된 사건은 world 의 활성 목록에서 빠진다.
    const closed = t.eventUpdates
      .filter((u) => u.status === 'resolved' || u.status === 'cancelled')
      .map((u) => u.eventId)

    if (closed.length > 0) {
      const [w] = await tx.select({ ids: worldStates.activeEventIds })
        .from(worldStates).where(eq(worldStates.sessionId, input.sessionId)).limit(1)
      if (w) {
        await tx.update(worldStates)
          .set({ activeEventIds: w.ids.filter((id) => !closed.includes(id)) })
          .where(eq(worldStates.sessionId, input.sessionId))
      }
    }

    /* ---- npc introductions ---- */
    for (const intro of t.npcIntroductions) {
      const [created] = await tx.insert(npcs).values({
        sessionId: input.sessionId,
        name: intro.name,
        role: intro.role,
        knows: intro.knows,
        relationshipToCharacter: intro.relationshipToCharacter,
        relationshipToUser: intro.relationshipToUser,
      }).returning({ id: npcs.id })

      if (created) {
        await tx.update(worldStates)
          .set({
            activeNpcIds: sql`${worldStates.activeNpcIds} || ${JSON.stringify([created.id])}::jsonb`,
          })
          .where(eq(worldStates.sessionId, input.sessionId))
      }
    }

    /* ---- memories ---- */
    // 같은 사실을 반복 저장하지 않는다.
    const fresh = dedupeCandidates(t.memories, input.existingMemories as never)
    if (fresh.length > 0) {
      await tx.insert(memories).values(fresh.map((m) => ({
        sessionId: input.sessionId,
        characterId: input.characterId,
        type: m.type,
        content: m.content,
        importance: Math.round(m.importance * 100),
        persistence: Math.round(m.persistence * 100),
        confidence: Math.round(m.confidence * 100),
      })))

      // 한도를 넘으면 중요도가 낮은 것부터 정리한다.
      const all = await tx.select().from(memories)
        .where(eq(memories.sessionId, input.sessionId))
      const { drop } = pruneMemories(all as never, POLICY.memory.maxPerSession)
      for (const m of drop) {
        await tx.delete(memories).where(eq(memories.id, m.id))
      }
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
    // AI 가 "나중에 연락하고 싶은 이유" 를 남겼다면 저장한다. 스케줄러가 우선 참고한다.
    // 사용자가 돌아와 턴을 진행했으므로 이전 의도는 더 이상 유효하지 않다 — 새 값으로 덮는다.
    await tx.update(roleplaySessions)
      .set({
        turnCount: input.turnIndex,
        lastInteractionAt: new Date(),
        pendingRealityIntent: t.realityIntent ?? null,
        ...(input.characterState ? { characterState: input.characterState } : {}),
      })
      .where(eq(roleplaySessions.id, input.sessionId))
  })
}
