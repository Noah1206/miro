import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { db, characterRuntimeStates, relationships, worldStates, characters, contactProfiles, memoryJobs, messages, messengerInbox, roleplaySessions, userSettings, users } from '@miro/db'
import { characterAgencyMode, feature, POLICY } from '@miro/config'
import { applyContactBoundaryRequest } from '@/lib/reality/boundary'
import { chooseAttention } from './attention'
import { observe } from '@/lib/observe'
import { characterAvailability } from '@/lib/reality/routine'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export class MessengerError extends Error {
  constructor(readonly reason: 'not_found' | 'restricted' | 'empty' | 'too_long' | 'conflict' | 'rate_limit') { super(reason) }
}
export type InboxReview = { ids: string[]; token: string }
export type MessengerItem = { id: string; role: string; kind: string; content: string; blocks: Array<Record<string, unknown>>; at: string; readAt?: string | null }

/** No model, wallet reservation, scene gateway or reply generation belongs to reception. */
export async function receiveMessenger(opts: { userId: string; sessionId: string; input: string; requestId: string; sentAt?: string }, now = new Date()): Promise<MessengerItem> {
  const input = opts.input.trim()
  if (!input) throw new MessengerError('empty')
  if (input.length > 2000) throw new MessengerError('too_long')
  if (!UUID.test(opts.sessionId) || !UUID.test(opts.requestId)) throw new MessengerError('not_found')
  // Preserve the sender's ordering across overlapping network requests; never use this
  // bounded display timestamp for scheduling, rate admission or relationship state.
  const clientTime = opts.sentAt ? Date.parse(opts.sentAt) : NaN
  const submittedAt = Number.isFinite(clientTime) && Math.abs(clientTime - now.getTime()) <= 5 * 60_000
    ? new Date(Math.min(clientTime, now.getTime())) : now
  const item = await db.transaction(async tx => {
    // The user lock bounds rate admission; the session lock serializes only short persistence.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`messenger:${opts.userId}`}))`)
    const [owner] = await tx.select().from(users).where(and(eq(users.id, opts.userId), isNull(users.deletedAt)))
    const [session] = await tx.select().from(roleplaySessions).where(and(eq(roleplaySessions.id, opts.sessionId), eq(roleplaySessions.userId, opts.userId), isNull(roleplaySessions.deletedAt))).for('update')
    if (!owner || !session || session.status !== 'active') throw new MessengerError('not_found')
    if (session.restrictedAt) throw new MessengerError('restricted')
    const [character] = await tx.select().from(characters).where(and(eq(characters.id, session.characterId), isNull(characters.deletedAt)))
    if (character?.experienceType !== 'reality') throw new MessengerError('not_found')
    const [previous] = await tx.select({ message: messages, inbox: messengerInbox }).from(messages)
      .leftJoin(messengerInbox, eq(messengerInbox.messageId, messages.id)).where(eq(messages.id, opts.requestId))
    if (previous) {
      if (previous.message.sessionId !== opts.sessionId || previous.message.role !== 'user' || previous.message.kind !== 'messenger' || previous.message.content !== input || !previous.inbox) throw new MessengerError('conflict')
      return serialize(previous.message, previous.inbox.readAt)
    }
    const [rate] = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM messenger_inbox i
      JOIN roleplay_sessions s ON s.id=i.session_id WHERE s.user_id=${opts.userId}::uuid
      AND i.created_at > ${new Date(now.getTime()-60_000).toISOString()}::timestamptz`)
    if ((rate?.n ?? 0) >= 60) throw new MessengerError('rate_limit')
    const [message] = await tx.insert(messages).values({ id: opts.requestId, sessionId: opts.sessionId, role: 'user', kind: 'messenger', content: input, blocks: [], turnIndex: session.turnCount, createdAt: submittedAt }).returning()
    await tx.insert(messengerInbox).values({ messageId: opts.requestId, sessionId: opts.sessionId,
      nextReviewAt: now, createdAt: now })
    await tx.update(messengerInbox).set({ attentionState: 'pending', attentionContextKey: null, nextReviewAt: now })
      .where(and(eq(messengerInbox.sessionId, opts.sessionId), eq(messengerInbox.status, 'unread'), eq(messengerInbox.attentionState, 'left')))
    await tx.update(roleplaySessions).set({ lastInteractionAt: now }).where(eq(roleplaySessions.id, opts.sessionId))
    return serialize(message!, null)
  })
  // Explicit requests for space remain authoritative even though reception is independent.
  const [settings] = await db.select({ timeZone: userSettings.timeZone }).from(userSettings).where(eq(userSettings.userId, opts.userId))
  await applyContactBoundaryRequest(opts.sessionId, opts.userId, input, opts.requestId, now, settings?.timeZone ?? POLICY.reality.defaultTimeZone)
  return item
}

export const replyPauseMs = (minutes: number) => Math.max(20_000, Math.min(5 * 60_000, Math.max(0, minutes) * 15_000))
export const inboxTrigger = (ids: string[]) => `messenger:read:${[...ids].sort().join(':')}`

function serialize(row: typeof messages.$inferSelect, readAt?: Date | null): MessengerItem {
  return { id: row.id, role: row.role, kind: row.hiddenAt ? 'hidden' : row.kind,
    content: row.hiddenAt ? '운영 정책에 따라 숨김 처리된 메시지입니다.' : row.content,
    blocks: row.hiddenAt ? [] : row.blocks as Array<Record<string, unknown>>, at: row.createdAt.toISOString(),
    ...(readAt !== undefined && row.role === 'user' && row.kind === 'messenger' ? { readAt: readAt?.toISOString() ?? null } : {}) }
}

export async function messengerItems(userId: string, sessionId: string): Promise<MessengerItem[] | null> {
  if (!UUID.test(sessionId)) return null
  const [owned] = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .innerJoin(users, eq(users.id, roleplaySessions.userId)).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(users.deletedAt), isNull(characters.deletedAt),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), eq(characters.experienceType, 'reality')))
  if (!owned) return null
  const rows = await db.select({ message: messages, inboxId: messengerInbox.messageId, readAt: messengerInbox.readAt }).from(messages)
    .leftJoin(messengerInbox, eq(messengerInbox.messageId, messages.id))
    .where(and(eq(messages.sessionId, sessionId), inArray(messages.kind, ['messenger', 'reality_message', 'photo', 'call_record'])))
    .orderBy(asc(messages.createdAt), asc(messages.id))
  return rows.filter(row => (row.message.kind !== 'call_record' || feature('voiceCall') || feature('videoCall'))
    && (row.message.kind !== 'photo' || row.message.blocks.some(b => b.type === 'reality'))).map(row => serialize(row.message, row.inboxId ? row.readAt : undefined))
}

/** Unread delivery is private to the inbox until the character actually opens it. */
export const characterCanSeeMessage = sql`NOT EXISTS (SELECT 1 FROM messenger_inbox unread_delivery
  WHERE unread_delivery.message_id = ${messages.id} AND unread_delivery.read_at IS NULL)`

/** A durable queue, also swept by cron. No timer or open browser is needed to retain work. */
export async function runMessengerInbox(now = new Date(), options: { sessionId?: string; limit?: number } = {}) {
  if (!feature('realityMessage')) return { checked: 0 }
  const due = await db.selectDistinct({ sessionId: messengerInbox.sessionId }).from(messengerInbox)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, messengerInbox.sessionId))
    .innerJoin(users, eq(users.id, roleplaySessions.userId))
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt),
      isNull(users.deletedAt), isNull(characters.deletedAt), eq(characters.experienceType, 'reality'),
      inArray(messengerInbox.status, ['unread', 'read']), sql`${messengerInbox.nextReviewAt} <= ${now.toISOString()}::timestamptz`,
      options.sessionId ? eq(messengerInbox.sessionId, options.sessionId) : undefined))
    .limit(Math.min(10, options.limit ?? 5))
  for (const row of due) {
    try { await reviewInbox(row.sessionId, now) }
    catch { observe('messenger.review_failed', { sessionId: row.sessionId }) }
  }
  return { checked: due.length }
}

async function reviewInbox(sessionId: string, now: Date) {
  const [row] = await db.select({ session: roleplaySessions, profile: contactProfiles, timeZone: userSettings.timeZone }).from(roleplaySessions)
    .innerJoin(users, eq(users.id, roleplaySessions.userId)).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .innerJoin(contactProfiles, eq(contactProfiles.characterId, characters.id)).leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(eq(roleplaySessions.id, sessionId), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt),
      isNull(users.deletedAt), isNull(characters.deletedAt), eq(characters.experienceType, 'reality'), eq(roleplaySessions.status, 'active')))
  if (!row) return
  const availability = await characterAvailability(row.session.characterId, now, row.timeZone ?? POLICY.reality.defaultTimeZone, { wait: false })
  if (availability.availability === 'unreachable') {
    await db.update(messengerInbox).set({ nextReviewAt: new Date(now.getTime() + Math.max(1, availability.minutesUntilFree ?? 15) * 60_000), leaseToken: null, leaseUntil: null })
      .where(and(eq(messengerInbox.sessionId, sessionId), inArray(messengerInbox.status, ['unread', 'read']), or(isNull(messengerInbox.leaseUntil), sql`${messengerInbox.leaseUntil} <= ${now.toISOString()}::timestamptz`)))
    return
  }
  const token = randomUUID()
  const review = await db.transaction(async tx => {
    const [locked] = await tx.execute<{ id: string }>(sql`SELECT id FROM roleplay_sessions WHERE id=${sessionId}::uuid
      AND deleted_at IS NULL AND restricted_at IS NULL AND status='active' FOR UPDATE SKIP LOCKED`)
    if (!locked) return null
    const [busy] = await tx.select({ id: messengerInbox.messageId }).from(messengerInbox).where(and(eq(messengerInbox.sessionId, sessionId),
      sql`${messengerInbox.leaseUntil} > ${now.toISOString()}::timestamptz`)).limit(1)
    if (busy) return null
    const batch = await tx.select().from(messengerInbox).where(and(eq(messengerInbox.sessionId, sessionId), inArray(messengerInbox.status, ['unread', 'read']),
      sql`${messengerInbox.nextReviewAt} <= ${now.toISOString()}::timestamptz`)).orderBy(asc(messengerInbox.createdAt), asc(messengerInbox.messageId)).limit(8)
    if (!batch.length) return null
    const unread = batch.filter(item => item.status === 'unread')
    if (unread.length) {
      const ids = unread.map(item => item.messageId)
      await tx.update(messengerInbox).set({ leaseToken: token, leaseUntil: new Date(now.getTime() + 5 * 60_000) }).where(inArray(messengerInbox.messageId, ids))
      return { kind: 'attention' as const, ids, token, envelopes: unread.map(item => ({ messageId: item.messageId, createdAt: item.createdAt })),
        previousKey: unread.every(item => item.attentionState === 'left') ? unread[0]!.attentionContextKey : null }
    }
    const ids = batch.map(item => item.messageId)
    await tx.update(messengerInbox).set({ leaseToken: token, leaseUntil: new Date(now.getTime() + 5 * 60_000) }).where(inArray(messengerInbox.messageId, ids))
    return { kind: 'reply' as const, ids, token }
  })
  if (!review) return
  try {
    if (review.kind === 'reply') {
      const { evaluateSession } = await import('@/lib/reality/evaluate')
      await evaluateSession(sessionId, now, { background: true, inbox: review })
    } else {
      const result = await chooseAttention(sessionId, row.session.userId, now, review.envelopes,
        { availability: availability.availability, label: availability.label }, review.previousKey)
      if (!result) return
      await db.transaction(async tx => {
        const [session] = await tx.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).for('update')
        const [owner] = await tx.select().from(users).where(eq(users.id, row.session.userId))
        const [character] = await tx.select().from(characters).where(eq(characters.id, row.session.characterId))
        const [profile] = await tx.select().from(contactProfiles).where(eq(contactProfiles.characterId, row.session.characterId)).for('share')
        if (!session || session.deletedAt || session.restrictedAt || session.status !== 'active' || session.userId !== row.session.userId
          || !feature('realityMessage') || characterAgencyMode(sessionId, session.policyVersion) !== 'live'
          || !owner || owner.deletedAt || !character || character.deletedAt || character.experienceType !== 'reality'
          || session.lastInteractionAt.getTime() !== row.session.lastInteractionAt.getTime()
          || JSON.stringify(session.characterState) !== JSON.stringify(row.session.characterState)
          || JSON.stringify(profile) !== JSON.stringify(row.profile)) return
        const claimed = await tx.select().from(messengerInbox).where(and(eq(messengerInbox.sessionId, sessionId),
          inArray(messengerInbox.messageId, review.ids), eq(messengerInbox.leaseToken, token), eq(messengerInbox.status, 'unread'))).for('update')
        if (claimed.length !== review.ids.length) return
        if (result.unchanged) {
          await tx.update(messengerInbox).set({ leaseToken: null, leaseUntil: null, nextReviewAt: new Date(now.getTime() + 15 * 60_000) })
            .where(and(inArray(messengerInbox.messageId, review.ids), eq(messengerInbox.leaseToken, token)))
          return
        }
        const [runtime] = await tx.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId)).for('share')
        const [relationship] = await tx.select().from(relationships).where(eq(relationships.sessionId, sessionId)).for('share')
        const [world] = await tx.select().from(worldStates).where(eq(worldStates.sessionId, sessionId)).for('share')
        if (runtime?.mode !== 'live' || runtime.version !== result.basis.runtimeVersion || runtime.revisionId !== result.basis.revisionId
          || relationship?.version !== result.basis.relationshipVersion || world?.version !== result.basis.worldVersion) return
        const reading = result.choice.action === 'read'
        await tx.update(messengerInbox).set({
          status: reading ? 'read' : 'unread', readAt: reading ? now : null,
          attentionState: result.choice.action === 'leave_unread' ? 'left' : reading ? 'pending' : 'deferred',
          attentionContextKey: result.contextKey, attentionDecision: { ...result.choice, at: now.toISOString(), providerMode: result.providerMode },
          nextReviewAt: new Date(now.getTime() + (reading ? replyPauseMs(profile!.replyDelayMinutes)
            : (result.choice.recheckMinutes ?? 15) * 60_000)), leaseToken: null, leaseUntil: null,
        }).where(and(inArray(messengerInbox.messageId, review.ids), eq(messengerInbox.leaseToken, token)))
        if (reading && feature('memoryExtraction')) await tx.insert(memoryJobs).values(review.ids.map(messageId => ({
          sessionId, characterId: session.characterId, userId: session.userId, messageId, throughTurn: session.turnCount,
          kind: 'memory_extraction' as const,
        }))).onConflictDoNothing()
      })
    }
  }
  finally {
    // The agency transaction settles successful choices. Failures retain read state and retry.
    await db.update(messengerInbox).set({ leaseToken: null, leaseUntil: null, nextReviewAt: new Date(now.getTime() + 60_000) })
      .where(and(inArray(messengerInbox.messageId, review.ids), eq(messengerInbox.leaseToken, token)))
  }
}
