import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, messages, relationships, roleplaySessions, stateTransitions, users, worldStates } from '@miro/db'
import { buildContext } from '@miro/engine'
import { beginRequest, failRequest } from '@/lib/ai/gateway'
import { changeStoryDate } from './story-date'
import { createRoleplaySession } from './start'
import { loadSession } from './snapshot'
import { commitTurn, StaleStateError } from './commit'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const made: string[] = []
async function fixture() {
  const [owner] = await db.insert(users).values({ email: `story-date-${randomUUID()}@example.test` }).returning()
  made.push(owner!.id)
  return { userId: owner!.id, ...(await createRoleplaySession(owner!.id, 'thomas')) }
}
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })

describeDb('header story date — persistence and independent clocks', () => {
  it('persists a dated scene marker and reloads it into model context without changing the relationship or real contact state', async () => {
    const s = await fixture()
    const [before] = await db.select().from(relationships).where(eq(relationships.sessionId, s.sessionId))
    const deadline = new Date(Date.now() + 86_400_000).toISOString()
    await db.update(roleplaySessions).set({ contactBoundary: { version: 1, mode: 'paused', until: deadline,
      requestedAt: new Date().toISOString(), sourceRequestId: 'request' }, pendingRealityIntent: { channel: 'message', urgency: .5, reason: 'real promise', notBefore: deadline } }).where(eq(roleplaySessions.id, s.sessionId))
    const first = await changeStoryDate(s.sessionId, s.userId, '1850-06-18', null)
    expect(first).toMatchObject({ ok: true, message: { role: 'system', kind: 'live_scene', content: '1850-06-18' } })
    await changeStoryDate(s.sessionId, s.userId, '1850-06-25', '1850-06-18')
    const loaded = (await loadSession(s.sessionId, s.userId))!
    expect(loaded.snapshot.world.narrativeCalendar).toMatchObject({ date: '1850-06-25', previousDate: '1850-06-18' })
    expect(loaded.snapshot.turnCount).toBe(0)
    const context = buildContext(loaded.snapshot)
    expect(context.prompt).toContain('Story date selected by the user: 1850-06-25')
    expect(context.prompt).toContain('moved forward 7 calendar day(s)')
    expect(context.prompt).not.toContain('세계의 하루도 이 때를 따릅니다')
    expect((await db.select().from(relationships).where(eq(relationships.sessionId, s.sessionId)))[0]).toEqual(before)
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, s.sessionId))
    expect(session!.contactBoundary!.until).toBe(deadline)
    expect(session!.pendingRealityIntent!.notBefore).toBe(deadline)
    expect((await db.select().from(stateTransitions).where(eq(stateTransitions.sessionId, s.sessionId))).filter(r => r.rule === 'user_story_date')).toHaveLength(2)
    expect((await db.select().from(messages).where(eq(messages.sessionId, s.sessionId))).filter(m => m.blocks.some(b => b.type === 'story_date')).map(m => m.content)).toEqual(['1850-06-18', '7일 후 · 1850-06-25'])
  })
  it('makes repeats idempotent and prevents two tabs overwriting a newer selection', async () => {
    const s = await fixture()
    await changeStoryDate(s.sessionId, s.userId, '2026-10-11', null)
    expect(await changeStoryDate(s.sessionId, s.userId, '2026-10-11', null)).toMatchObject({ ok: true, message: null })
    const results = await Promise.all([changeStoryDate(s.sessionId, s.userId, '2026-10-18', '2026-10-11'), changeStoryDate(s.sessionId, s.userId, '2026-10-25', '2026-10-11')])
    expect(results.filter(r => r.ok)).toHaveLength(1)
    expect(results.filter(r => !r.ok)).toEqual([{ ok: false, reason: 'conflict' }])
    expect((await db.select().from(worldStates).where(eq(worldStates.sessionId, s.sessionId)))[0]!.version).toBe(3)
  })
  it('rejects invalid dates, another owner and inactive or restricted conversations', async () => {
    const s = await fixture()
    expect(await changeStoryDate(s.sessionId, s.userId, '2026-02-30', null)).toEqual({ ok: false, reason: 'invalid' })
    expect(await changeStoryDate(s.sessionId, randomUUID(), '2026-10-11', null)).toEqual({ ok: false, reason: 'not_found' })
    for (const status of ['archived', 'restricted', 'deleted']) {
      await db.update(roleplaySessions).set(status === 'archived' ? { status: 'archived' } : status === 'restricted' ? { status: 'active', restrictedAt: new Date() } : { restrictedAt: null, deletedAt: new Date() }).where(eq(roleplaySessions.id, s.sessionId))
      expect(await changeStoryDate(s.sessionId, s.userId, '2026-10-11', null)).toEqual({ ok: false, reason: 'not_found' })
    }
  })
  it('holds date changes during a live turn and versions the world against stale model commits', async () => {
    const s = await fixture()
    const loaded = (await loadSession(s.sessionId, s.userId))!
    const request = await beginRequest(s.userId, s.sessionId, '오늘은 어때?')
    expect(await changeStoryDate(s.sessionId, s.userId, '2026-10-11', null)).toEqual({ ok: false, reason: 'busy' })
    await failRequest(request.requestId)
    expect((await changeStoryDate(s.sessionId, s.userId, '2026-10-11', null)).ok).toBe(true)
    const snapshot = loaded.snapshot
    const blocks = [{ type: 'dialogue' as const, speaker: loaded.characterName, text: '옛 장면의 응답' }]
    await expect(commitTurn({ sessionId: s.sessionId, characterId: loaded.characterId, turnIndex: 1, userInput: '오늘은 어때?', responseText: '옛 장면의 응답', blocks,
      worldVersion: snapshot.world.version, relationshipVersion: snapshot.relationship.version, currentRelationship: snapshot.relationship, existingMemories: snapshot.memories,
      transition: { blocks, worldDelta: null, relationshipDelta: {}, sceneDelta: null, memories: [], newEvent: null, eventUpdates: [], npcIntroductions: [], npcActions: [], realityIntent: null, emotion: undefined, intent: undefined, issues: [] } })).rejects.toBeInstanceOf(StaleStateError)
    expect((await loadSession(s.sessionId, s.userId))!.snapshot.world.narrativeCalendar?.date).toBe('2026-10-11')
  })
})
