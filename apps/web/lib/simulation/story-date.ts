import { randomUUID } from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db, characters, conversationRequests, messages, roleplaySessions, stateTransitions, users, worldStates } from '@miro/db'
import { storyDaysBetween, validStoryDate, type NarrativeCalendar } from '@miro/domain'

type Failure = 'invalid' | 'not_found' | 'busy' | 'conflict'
export type StoryDateResult = { ok: false; reason: Failure } | {
  ok: true; calendar: NarrativeCalendar
  message: { id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>> } | null
}

/** Serializes with conversation admission and versions the world so an old model result cannot overwrite it. */
export async function changeStoryDate(sessionId: string, userId: string, date: string, expectedDate: string | null): Promise<StoryDateResult> {
  if (!validStoryDate(date) || (expectedDate !== null && !validStoryDate(expectedDate))) return { ok: false, reason: 'invalid' }
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conversation:${sessionId}`}))`)
    const [session] = await tx.select().from(roleplaySessions)
      .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId))).for('update')
    if (!session || session.deletedAt || session.restrictedAt || session.status !== 'active') return { ok: false, reason: 'not_found' }
    const [character] = await tx.select({ deletedAt: characters.deletedAt }).from(characters).where(eq(characters.id, session.characterId)).for('share')
    const [owner] = await tx.select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, userId)).for('share')
    if (!character || character.deletedAt || !owner || owner.deletedAt) return { ok: false, reason: 'not_found' }
    const [pending] = await tx.select({ id: conversationRequests.id }).from(conversationRequests)
      .where(and(eq(conversationRequests.sessionId, sessionId), eq(conversationRequests.status, 'pending'), gt(conversationRequests.leaseUntil, new Date()))).limit(1)
    if (pending) return { ok: false, reason: 'busy' }
    const [world] = await tx.select().from(worldStates).where(eq(worldStates.sessionId, sessionId)).for('update')
    if (!world) return { ok: false, reason: 'not_found' }
    const previous = world.narrativeCalendar
    if (previous?.date === date) return { ok: true, calendar: previous, message: null }
    if ((previous?.date ?? null) !== expectedDate) return { ok: false, reason: 'conflict' }
    const calendar: NarrativeCalendar = { version: 1, date,
      previousDate: previous?.changedAtTurn === session.turnCount ? previous.previousDate ?? previous.date : previous?.date ?? null,
      changedAtTurn: session.turnCount }
    const days = previous ? storyDaysBetween(previous.date, date) : null
    const content = days === null ? date : `${Math.abs(days)}일 ${days > 0 ? '후' : '전'} · ${date}`
    const [marker] = await tx.insert(messages).values({ sessionId, role: 'system', kind: 'live_scene', content,
      blocks: [{ type: 'story_date', date, previousDate: calendar.previousDate, days }], turnIndex: session.turnCount }).returning()
    await tx.update(worldStates).set({ narrativeCalendar: calendar, version: world.version + 1, updatedAt: new Date() }).where(eq(worldStates.id, world.id))
    await tx.insert(stateTransitions).values({ sessionId, triggerKey: `story-date:${randomUUID()}`, seq: 0, policyVersion: 'turn-policy:v1',
      engine: session.policyVersion === 'agency:v1' ? 'agency' : 'legacy', actor: 'user', causeMessageId: marker!.id,
      field: 'world.narrativeCalendar', before: previous, after: calendar, rule: 'user_story_date', status: 'applied', clock: 'narrative' })
    return { ok: true, calendar, message: { id: marker!.id, role: marker!.role, kind: marker!.kind, content: marker!.content, blocks: marker!.blocks } }
  })
}
