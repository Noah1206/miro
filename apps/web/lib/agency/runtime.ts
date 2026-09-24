import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db, characterRevisions, characterRuntimeStates, characters, messages, roleplaySessions } from '@miro/db'
import { characterAgencyMode, productionRuntime } from '@miro/config'
import { createAgencyState, type AgencyEvidence, type AgencyState } from '@miro/domain'
import { compileAuthoredCharacter, type SimulationSnapshot } from '@miro/engine'
import type { LLMProvider } from '@miro/providers'
import { afterResponse } from '@/lib/defer'
import { observe } from '@/lib/observe'
import { captureAgencyRevision, pinAgencyRevision } from './revisions'

export type LoadedAgency = {
  mode: 'live' | 'shadow'
  revision: typeof characterRevisions.$inferSelect & { compiled: NonNullable<typeof characterRevisions.$inferSelect['compiled']> }
  state: AgencyState
  version: number
}

/** Lease + compare-and-swap prevent an expired worker replacing a newer compilation. */
export async function compileAgencyRevision(revisionId: string, llm: LLMProvider): Promise<boolean> {
  if (characterAgencyMode() === 'off') return false
  if (characterAgencyMode() === 'shadow' && llm.info.mode !== 'mock') return false
  const token = randomUUID(), now = new Date()
  const [job] = await db.update(characterRevisions).set({
    status: 'compiling', leaseToken: token, leaseUntil: new Date(now.getTime() + 120_000),
    attempts: sql`${characterRevisions.attempts} + 1`, errorCode: null,
  }).where(and(eq(characterRevisions.id, revisionId), lt(characterRevisions.attempts, 3),
    or(eq(characterRevisions.status, 'pending'), and(inArray(characterRevisions.status, ['compiling', 'failed']), lt(characterRevisions.leaseUntil, now)))))
    .returning()
  if (!job) return false
  try {
    const result = await compileAuthoredCharacter(llm, job.authored, job.sourceHash)
    if (productionRuntime() && result.providerMode !== 'live') throw new Error('agency_compiler_not_live')
    const updated = await db.update(characterRevisions).set({ compiled: result.compiled, status: 'ready', providerMode: result.providerMode, leaseToken: null, leaseUntil: null })
      .where(and(eq(characterRevisions.id, job.id), eq(characterRevisions.leaseToken, token))).returning({ id: characterRevisions.id })
    return updated.length === 1
  } catch {
    await db.update(characterRevisions).set({ status: 'failed', errorCode: 'compilation_failed', leaseToken: null,
      leaseUntil: new Date(Date.now() + Math.max(1, job.attempts) * 5 * 60_000) })
      .where(and(eq(characterRevisions.id, job.id), eq(characterRevisions.leaseToken, token)))
    observe('agency.compilation_failed', { revisionId: job.id })
    return false
  }
}

/** Called only after authenticated loadSession. Recheck here before creating a private revision. */
export async function loadAgencyRuntime(sessionId: string, userId: string, snapshot: SimulationSnapshot, llm: LLMProvider, now = new Date()): Promise<LoadedAgency | null> {
  const mode = characterAgencyMode(sessionId)
  if (mode === 'off') return null // No new schema query when disabled, including during rollout.
  if (mode === 'shadow' && llm.info.mode !== 'mock') return null // No interactive-user budget spent on a comparison.
  const [owned] = await db.select({ id: roleplaySessions.id }).from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId),
      eq(roleplaySessions.characterId, snapshot.character.id), eq(roleplaySessions.status, 'active'),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), isNull(characters.deletedAt))).limit(1)
  if (!owned) return null
  let [runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId)).limit(1)
  let revision: typeof characterRevisions.$inferSelect | undefined
  if (runtime) {
    ;[revision] = await db.select().from(characterRevisions).where(and(eq(characterRevisions.id, runtime.revisionId), eq(characterRevisions.characterId, snapshot.character.id))).limit(1)
  } else {
    revision = await db.transaction(async tx => {
      const captured = await captureAgencyRevision(tx, snapshot.character.id)
      await pinAgencyRevision(tx, sessionId, captured, now)
      return captured ?? undefined
    })
    // Legacy sessions pin pending sources too; concurrent loaders may already have pinned another source.
    if (mode === 'live') {
      ;[runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId)).limit(1)
      if (runtime && runtime.revisionId !== revision?.id) {
        ;[revision] = await db.select().from(characterRevisions).where(and(eq(characterRevisions.id, runtime.revisionId), eq(characterRevisions.characterId, snapshot.character.id))).limit(1)
      }
    }
  }
  if (!revision) return null
  if (revision.status !== 'ready' || !revision.compiled) {
    if (revision.status === 'pending' || revision.status === 'compiling' || (revision.status === 'failed' && revision.attempts < 3)) {
      const revisionId = revision.id
      await afterResponse(() => compileAgencyRevision(revisionId, llm))
    }
    return null
  }
  if (productionRuntime() && revision.providerMode !== 'live') return null
  if (mode === 'shadow') return { mode, revision: { ...revision, compiled: revision.compiled },
    state: runtime?.state ?? createAgencyState(revision.id, now.toISOString()), version: runtime?.version ?? 0 }
  if (!runtime) {
    await db.insert(characterRuntimeStates).values({ sessionId, revisionId: revision.id, mode,
      state: createAgencyState(revision.id, now.toISOString()),
    }).onConflictDoNothing()
    ;[runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId)).limit(1)
    // A concurrent request may have pinned a different revision. Reload that authoritative version.
    if (runtime && runtime.revisionId !== revision.id) {
      ;[revision] = await db.select().from(characterRevisions).where(and(eq(characterRevisions.id, runtime.revisionId), eq(characterRevisions.characterId, snapshot.character.id))).limit(1)
    }
  }
  if (!runtime || !revision?.compiled || revision.status !== 'ready') return null
  return { mode: runtime.mode, revision: { ...revision, compiled: revision.compiled }, state: runtime.state, version: runtime.version }
}

/** Goals retain actual message IDs even after those messages leave the recent window. */
export async function loadAgencyEvidence(sessionId: string, snapshot: SimulationSnapshot, runtime: LoadedAgency, input?: { id: string; text: string }, now = new Date()): Promise<AgencyEvidence[]> {
  const refs = [...new Set([...runtime.state.goals.flatMap(g => g.evidenceIds), ...runtime.state.beliefs.flatMap(b => b.evidenceIds),
    ...runtime.state.actions.flatMap(a => a.outcomeEvidenceId ? [a.outcomeEvidenceId] : [])])]
    .filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 64)
  const stored = refs.length ? await db.select().from(messages).where(and(eq(messages.sessionId, sessionId), inArray(messages.id, refs), isNull(messages.hiddenAt))) : []
  const evidence: AgencyEvidence[] = []
  const actor = snapshot.character.id
  for (const message of [...snapshot.recentMessages, ...stored]) {
    if (!message.id || !['user', 'character'].includes(message.role)) continue
    const blocks = message.blocks ?? []
    const text = blocks.length && message.kind !== 'reality_message' ? blocks.filter(b => b.type === 'dialogue' && (!b.speaker || b.speaker === snapshot.character.identity.name))
      .map(b => b.text).join('\n') : message.content
    if (!text.trim()) continue
    const at = 'createdAt' in message ? message.createdAt.toISOString() : message.at ?? now.toISOString()
    evidence.push({ sessionId, id: message.id, quote: text.slice(0, 2000), actor: message.role === 'user' ? 'user' : actor,
      occurredAt: at, kind: 'message', epistemic: 'reported', knownTo: [actor] })
    const outcome = message.role === 'character' ? runtime.state.actions.find(a => a.outcomeEvidenceId === message.id) : undefined
    if (outcome && ['sent', 'completed'].includes(outcome.status)) evidence.push({ sessionId, id: message.id,
      quote: 'The application persisted this character message. This does not prove receipt or reading.', actor,
      occurredAt: at, kind: 'outcome', epistemic: 'observed', knownTo: [actor], actionId: outcome.id,
      goalIds: outcome.goalIds, outcomeStatus: outcome.status })
  }
  // Legacy events have no observer/time provenance. They cannot become fresh observed facts on every tick.
  if (input) evidence.push({ sessionId, id: input.id, quote: input.text, actor: 'user', occurredAt: now.toISOString(), kind: 'message', epistemic: 'reported', knownTo: [actor] })
  return [...new Map(evidence.map(e => [e.id, e])).values()]
}
