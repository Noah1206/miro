import { and, eq, inArray } from 'drizzle-orm'
import { db, conversationRequests, realityContacts, realityPushJobs, roleplaySessions, stateTransitions } from '@miro/db'
import { contactBoundaryActive, requestedContactBoundary, type ContactBoundary } from '@miro/domain'

/** Persist accepted requests even if the subsequent AI call fails or the token wallet is empty. */
export async function applyContactBoundaryRequest(sessionId: string, userId: string, input: string, requestId: string,
  now: Date, timeZone: string): Promise<ContactBoundary | null> {
  const requested = requestedContactBoundary(input, now, timeZone, requestId)
  if (!requested) return null
  return db.transaction(async tx => {
    const [request] = await tx.select().from(conversationRequests).where(and(eq(conversationRequests.id, requestId),
      eq(conversationRequests.sessionId, sessionId), eq(conversationRequests.userId, userId))).for('share')
    // Match commitTurn's request -> session lock order.
    const [session] = await tx.select().from(roleplaySessions).where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId))).for('update')
    if (!session || session.deletedAt || session.restrictedAt || session.status !== 'active' || !request || request.status !== 'pending') return null
    if (session.contactBoundary?.sourceRequestId === requestId) return session.contactBoundary
    const active = contactBoundaryActive(requested, now)
    await tx.update(roleplaySessions).set({ contactBoundary: requested, ...(active ? { pendingRealityIntent: null } : {}) }).where(eq(roleplaySessions.id, sessionId))
    if (active) {
      // Cancel old queued notifications permanently: ending a pause must not flush them later.
      const contacts = tx.select({ id: realityContacts.id }).from(realityContacts).where(eq(realityContacts.sessionId, sessionId))
      await tx.update(realityPushJobs).set({ status: 'cancelled', leaseToken: null, leaseUntil: null })
        .where(and(inArray(realityPushJobs.contactId, contacts), inArray(realityPushJobs.status, ['pending', 'sending'])))
    }
    await tx.insert(stateTransitions).values({ sessionId, triggerKey: `boundary:${requestId}`, seq: 0, policyVersion: 'turn-policy:v1',
      engine: session.policyVersion === 'agency:v1' ? 'agency' : 'legacy', actor: 'user', causeMessageId: null,
      field: 'contact.boundary', before: session.contactBoundary, after: requested, rule: 'user_contact_request', status: 'applied', clock: 'real' })
      .onConflictDoNothing()
    return requested
  })
}
