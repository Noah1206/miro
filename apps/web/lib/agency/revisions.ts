import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { characterAgencyCohort, characterAgencyMode } from '@miro/config'
import { createAgencyState } from '@miro/domain'
import { hashAuthoredCharacter } from '@miro/engine'
import { db, characters, worlds, characterVisualIdentities, characterRevisions, characterRuntimeStates, roleplaySessions } from '@miro/db'
import { afterResponse } from '@/lib/defer'
import { observe } from '@/lib/observe'
import { characterContext } from '@/lib/simulation/character-context'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { authoredDocument } from './authored'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type CharacterRevision = typeof characterRevisions.$inferSelect
const NUMERIC_TRAITS = new Set(['personality.jealousy', 'personality.initiative', 'personality.emotionalExpression'])

/**
 * Capture only for the experiment: a cohort session, or any save while the non-production '*' cohort
 * is on. A production cohort lists existing session IDs, so ordinary saves never capture or compile.
 */
function captureAllowed(sessionId?: string): boolean {
  if (sessionId) return characterAgencyMode(sessionId) !== 'off'
  return characterAgencyMode() !== 'off' && characterAgencyCohort().all
}

/** Called inside the authenticated character save/start transaction. Never rewrites an existing revision. */
export async function captureAgencyRevision(
  tx: Transaction, characterId: string, options: { explicitFields?: string[]; sessionId?: string } = {},
): Promise<CharacterRevision | null> {
  if (!captureAllowed(options.sessionId)) return null
  // All capture/edit callers take the character row lock before related profile writes/reads.
  // A new session consequently receives one complete saved profile, not half of a concurrent edit.
  const [character] = await tx.select().from(characters)
    .where(and(eq(characters.id, characterId), isNull(characters.deletedAt))).for('update').limit(1)
  if (!character) throw new Error('CHARACTER_NOT_FOUND')
  const [world] = await tx.select().from(worlds).where(eq(worlds.characterId, characterId)).limit(1)
  const [visual] = await tx.select().from(characterVisualIdentities).where(and(
    eq(characterVisualIdentities.characterId, characterId), eq(characterVisualIdentities.isActive, true),
  )).orderBy(desc(characterVisualIdentities.version), desc(characterVisualIdentities.createdAt)).limit(1)
  const [previous] = await tx.select().from(characterRevisions).where(eq(characterRevisions.characterId, characterId))
    .orderBy(desc(characterRevisions.createdAt), desc(characterRevisions.id)).limit(1)
  const explicitFields = [...(previous?.authored.explicitFields ?? []), ...(options.explicitFields ?? [])]
    .filter(field => NUMERIC_TRAITS.has(field))
  const profile = { character: characterContext(character, visual), worldSetting: world?.worldSetting ?? null, worldGenre: world?.genre ?? null }
  const authored = authoredDocument(profile.character, profile.worldSetting, explicitFields, profile.worldGenre)
  const sourceHash = hashAuthoredCharacter(authored)
  const [inserted] = await tx.insert(characterRevisions).values({ characterId, sourceHash, authored, profile })
    .onConflictDoNothing({ target: [characterRevisions.characterId, characterRevisions.sourceHash] }).returning()
  if (inserted) return inserted
  const [existing] = await tx.select().from(characterRevisions).where(and(
    eq(characterRevisions.characterId, characterId), eq(characterRevisions.sourceHash, sourceHash),
  )).limit(1)
  if (!existing) throw new Error('AGENCY_REVISION_NOT_FOUND')
  return existing
}

/** Pin the source even while compilation is pending. An edit cannot replace this session's character. */
export async function pinAgencyRevision(tx: Transaction, sessionId: string, revision: CharacterRevision | null, now = new Date()): Promise<boolean> {
  if (!revision || characterAgencyMode(sessionId) !== 'live') return false
  const [session] = await tx.select({ id: roleplaySessions.id }).from(roleplaySessions).where(and(
    eq(roleplaySessions.id, sessionId), eq(roleplaySessions.characterId, revision.characterId),
    eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt),
  )).limit(1)
  if (!session) throw new Error('AGENCY_REVISION_SESSION_MISMATCH')
  const [inserted] = await tx.insert(characterRuntimeStates).values({
    sessionId, revisionId: revision.id, mode: 'live', state: createAgencyState(revision.id, now.toISOString()),
  }).onConflictDoNothing({ target: characterRuntimeStates.sessionId }).returning({ sessionId: characterRuntimeStates.sessionId })
  return Boolean(inserted)
}

/** Shares the existing provider gateway, user budget and compile lease; no model call in the save transaction. */
export async function scheduleAgencyCompilation(revisionId: string | null | undefined, userId: string): Promise<void> {
  if (!revisionId || characterAgencyMode() === 'off') return
  await afterResponse(async () => {
    try {
      // Dynamic import keeps capture independent from runtime loading and its lazy capture path.
      const { compileAgencyRevision } = await import('./runtime')
      // ai_usage.request_id is a uuid column: a composite key here made every compile fail.
      const llm = resolveRpLLM('캐릭터 설정', {
        userId, requestId: randomUUID(), workload: 'background', usageUnits: 0,
        shadow: characterAgencyMode() === 'shadow',
      })
      await compileAgencyRevision(revisionId, llm)
    } catch {
      observe('agency.compilation_schedule_failed', { revisionId })
    }
  })
}
