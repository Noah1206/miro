import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db, characters, roleplaySessions, stateTransitions, users } from '@miro/db'
import { characterAgencyMode, defaultSessionPolicy, type SessionPolicyVersion } from '@miro/config'

/** User-authorized product rollout: keep all history/state and record the policy change exactly once. */
export async function adoptRelationshipPolicy(sessionId: string, userId?: string): Promise<SessionPolicyVersion | null> {
  if (characterAgencyMode() !== 'live' || defaultSessionPolicy('reality') !== 'agency:v1') return null
  return db.transaction(async tx => {
    const [session] = await tx.select().from(roleplaySessions).where(and(eq(roleplaySessions.id, sessionId),
      ...(userId ? [eq(roleplaySessions.userId, userId)] : []))).for('update')
    if (!session || session.deletedAt || session.restrictedAt || session.status !== 'active') return null
    const [character] = await tx.select({ id: characters.id }).from(characters).where(and(eq(characters.id, session.characterId),
      eq(characters.experienceType, 'reality'), isNull(characters.deletedAt))).for('share')
    const [owner] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, session.userId), isNull(users.deletedAt))).for('share')
    if (!character || !owner) return null
    if (session.policyVersion === 'agency:v1') return 'agency:v1'
    await tx.update(roleplaySessions).set({ policyVersion: 'agency:v1', pendingRealityIntent: session.pendingRealityIntent?.answers ? session.pendingRealityIntent : null })
      .where(eq(roleplaySessions.id, sessionId))
    await tx.insert(stateTransitions).values({ sessionId, triggerKey: `policy:${randomUUID()}`, seq: 0, policyVersion: 'turn-policy:v1',
      engine: 'agency', actor: 'operator', field: 'session.policyVersion', before: 'legacy:v1', after: 'agency:v1',
      rule: 'relationship_experience_adoption', status: 'applied', clock: 'real' })
    return 'agency:v1'
  })
}
