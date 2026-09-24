import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, characters, events, messages, roleplaySessions, users, worlds } from '@miro/db'
import { evaluateEligibility } from '@miro/domain'
import { createRoleplaySession } from './start'
import { loadSession } from './snapshot'
import { commitTurn } from './commit'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip

describeDb('loadSession event history', () => {
  const createdUsers: string[] = []

  afterAll(async () => {
    for (const userId of createdUsers) await db.delete(users).where(eq(users.id, userId))
  })

  it('keeps every committed turn in the order it was said: user, scene, reply', async () => {
    const [user] = await db.insert(users).values({ email: `snapshot-order-${randomUUID()}@example.test` }).returning()
    createdUsers.push(user!.id)
    const { sessionId } = await createRoleplaySession(user!.id, 'thomas')
    for (let turn = 1; turn <= 6; turn++) {
      const loaded = (await loadSession(sessionId, user!.id))!
      const s = loaded.snapshot
      const blocks = [{ type: 'dialogue' as const, speaker: s.character.identity.name, text: `답장 ${turn}` }]
      await commitTurn({ sessionId, characterId: loaded.characterId, turnIndex: s.turnCount + 1, userInput: `질문 ${turn}`,
        responseText: `답장 ${turn}`, blocks, sceneMarker: turn % 2 === 0 ? `장면 ${turn}` : null,
        transition: { blocks, worldDelta: null, relationshipDelta: {}, sceneDelta: null, memories: [], newEvent: null,
          eventUpdates: [], npcIntroductions: [], npcActions: [], realityIntent: null, emotion: undefined, intent: undefined, issues: [] },
        worldVersion: s.world.version, relationshipVersion: s.relationship.version,
        currentRelationship: s.relationship, existingMemories: s.memories })
    }
    const recent = (await loadSession(sessionId, user!.id))!.snapshot.recentMessages
      .map(m => m.content).filter(content => /^(질문|장면|답장) \d$/.test(content))
    expect(recent).toEqual([1, 2, 3, 4, 5, 6].flatMap(t => [`질문 ${t}`, ...(t % 2 === 0 ? [`장면 ${t}`] : []), `답장 ${t}`]))
  })

  it('keeps intro lines in written order, so the newest line is what an archive preview shows', async () => {
    const [user] = await db.insert(users).values({ email: `snapshot-intro-${randomUUID()}@example.test` }).returning()
    createdUsers.push(user!.id)
    const [character] = await db.insert(characters).values({ ownerId: user!.id, name: '인트로', personality: '조용하다.', isPublic: false,
      sampleDialogue: ['첫째 줄', '둘째 줄', '셋째 줄'].map(text => ({ role: 'character' as const, text, purpose: 'intro' as const })) }).returning()
    await db.insert(worlds).values({ characterId: character!.id, location: '서울', worldSetting: '현대 서울' })
    const { sessionId } = await createRoleplaySession(user!.id, character!.id)
    const newestFirst = await db.select({ content: messages.content }).from(messages).where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
    expect(newestFirst.map(m => m.content)).toEqual(['셋째 줄', '둘째 줄', '첫째 줄'])
    await db.delete(characters).where(eq(characters.id, character!.id))
  })

  it('keeps active continuity and old live cooldowns while bounding resolved history', async () => {
    const [user] = await db.insert(users).values({ email: `snapshot-${randomUUID()}@example.test` }).returning()
    createdUsers.push(user!.id)
    const { sessionId } = await createRoleplaySession(user!.id, 'thomas')
    const { sessionId: otherSessionId } = await createRoleplaySession(user!.id, 'taeyun')
    await db.update(roleplaySessions).set({ turnCount: 1000 }).where(eq(roleplaySessions.id, sessionId))

    const oldCooldownId = randomUUID()
    await db.insert(events).values([
      ...Array.from({ length: 1000 }, (_, index) => ({
        sessionId, type: 'work', status: 'resolved' as const,
        createdAtTurn: index + 1, resolvedAtTurn: index === 0 ? null : index + 1,
        cooldownUntilTurn: index + 9,
      })),
      { id: oldCooldownId, sessionId, type: 'jealousy', status: 'resolved',
        createdAtTurn: 1, resolvedAtTurn: 1, cooldownUntilTurn: 1100 },
      { sessionId, type: 'crisis', status: 'active', createdAtTurn: 2,
        continuationState: { reason: 'still ongoing' } },
      { sessionId, type: 'promise', status: 'escalated', createdAtTurn: 3 },
      { sessionId, type: 'rival', status: 'created', createdAtTurn: 4 },
      { sessionId, type: 'injury', status: 'expired', createdAtTurn: 5 },
      { sessionId: otherSessionId, type: 'conflict', status: 'active', createdAtTurn: 1 },
    ])
    await db.insert(messages).values(Array.from({ length: 600 }, (_, index) => ({
      sessionId, role: index % 2 === 0 ? 'user' as const : 'character' as const,
      kind: 'text' as const, content: `message-${index} ${'x'.repeat(512)}`,
      blocks: [], turnIndex: index + 1,
    })))
    const [eventCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(events).where(eq(events.sessionId, sessionId))
    const [messageCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(messages).where(eq(messages.sessionId, sessionId))
    expect(eventCount!.count).toBe(1005)
    expect(messageCount!.count).toBe(600)

    const loaded = (await loadSession(sessionId, user!.id))!
    expect(loaded.snapshot.activeEvents.map((event) => event.type).sort()).toEqual(['crisis', 'promise'])
    expect(loaded.snapshot.activeEvents.find((event) => event.type === 'crisis')!.continuationState)
      .toEqual({ reason: 'still ongoing' })
    expect(loaded.snapshot.recentlyResolvedEvents).toHaveLength(25)
    expect(loaded.snapshot.recentlyResolvedEvents.slice(0, 24).map((event) => event.resolvedAtTurn))
      .toEqual(Array.from({ length: 24 }, (_, index) => 1000 - index))
    expect(loaded.snapshot.recentlyResolvedEvents.at(-1)!.id).toBe(oldCooldownId)
    expect(loaded.snapshot.recentMessages).toHaveLength(24)
    expect(loaded.snapshot.recentMessages[0]!.content).toContain('message-576')
    expect(loaded.snapshot.recentMessages.at(-1)!.content).toContain('message-599')
    expect(evaluateEligibility({
      candidate: { type: 'jealousy', context: {}, participantNpcIds: [], relevance: 0.9, salience: 0.9 },
      activeEvents: loaded.snapshot.activeEvents,
      resolvedEvents: loaded.snapshot.recentlyResolvedEvents,
      currentTurn: 1000,
    })).toEqual({ eligible: false, reason: 'max_active_events' })

    await db.update(events).set({ status: 'resolved', resolvedAtTurn: 1000, cooldownUntilTurn: 1008 })
      .where(and(eq(events.sessionId, sessionId), inArray(events.status, ['active', 'escalated'])))
    const afterResolution = (await loadSession(sessionId, user!.id))!
    expect(afterResolution.snapshot.recentlyResolvedEvents.some((event) => event.id === oldCooldownId)).toBe(true)
    expect(evaluateEligibility({
      candidate: { type: 'jealousy', context: {}, participantNpcIds: [], relevance: 0.9, salience: 0.9 },
      activeEvents: afterResolution.snapshot.activeEvents,
      resolvedEvents: afterResolution.snapshot.recentlyResolvedEvents,
      currentTurn: 1000,
    })).toEqual({ eligible: false, reason: 'cooldown' })

    await db.update(roleplaySessions).set({ turnCount: 1101 }).where(eq(roleplaySessions.id, sessionId))
    const afterCooldown = (await loadSession(sessionId, user!.id))!
    expect(afterCooldown.snapshot.recentlyResolvedEvents).toHaveLength(24)
    expect(evaluateEligibility({
      candidate: { type: 'jealousy', context: {}, participantNpcIds: [], relevance: 0.9, salience: 0.9 },
      activeEvents: afterCooldown.snapshot.activeEvents,
      resolvedEvents: afterCooldown.snapshot.recentlyResolvedEvents,
      currentTurn: 1101,
    }).eligible).toBe(true)
    expect(await loadSession(sessionId, randomUUID())).toBeNull()
  })
})
