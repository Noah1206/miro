import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import {
  db, characterDecisions, characterRevisions, characterRuntimeStates, characters,
  messages, relationships, roleplaySessions, users, worlds, worldStates,
} from '@miro/db'
import { type AgencyGoal } from '@miro/domain'
import { hashAuthoredCharacter, planAgencyDecision, runTurn, type AgencyPlan, type TurnResult, type ValidatedTransition } from '@miro/engine'
import type { LLMProvider } from '@miro/providers'
import { createRoleplaySession } from '@/lib/simulation/start'
import { loadSession, type LoadedSession } from '@/lib/simulation/snapshot'
import { commitTurn, StaleStateError, type CommitInput } from '@/lib/simulation/commit'
import { authoredDocument } from './authored'
import { loadAgencyEvidence, loadAgencyRuntime, type LoadedAgency } from './runtime'
import { prepareAgencyTurn } from './turn-context'

// Observe real database entry points; no query result or transaction is mocked.
const databaseAccess = vi.hoisted(() => ({ methods: [] as string[] }))
vi.mock('@miro/db', async (original) => {
  const actual = await original<typeof import('@miro/db')>()
  return { ...actual, db: new Proxy(actual.db, { get(target, key) {
    if (typeof key === 'string') databaseAccess.methods.push(key)
    return Reflect.get(target, key)
  } }) }
})

// Scheduled compiles are observed, not run: this suite records provider calls explicitly.
const deferred = vi.hoisted(() => ({ tasks: [] as Array<() => Promise<unknown>> }))
vi.mock('@/lib/defer', () => ({ afterResponse: async (task: () => Promise<unknown>) => { deferred.tasks.push(task) } }))

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const createdUsers: string[] = []
const value = '상대의 선택을 존중하고 약속을 지킨다.'
const reply = '알겠어요. 말씀하신 내용을 기억할게요.'
const unusedProvider: LLMProvider = {
  info: { name: 'unused-recording', mode: 'mock', notice: 'No generation expected' },
  async generateStructured() { throw new Error('unexpected compilation') },
}
type Fixture = { userId: string; sessionId: string; loaded: LoadedSession }

async function user() {
  const [created] = await db.insert(users).values({ email: `agency-${randomUUID()}@example.test` }).returning()
  createdUsers.push(created!.id)
  return created!.id
}

async function readyRevision(loaded: LoadedSession) {
  const snapshot = loaded.snapshot
  const authored = authoredDocument(snapshot.character, snapshot.worldSetting, [], snapshot.worldGenre)
  const sourceHash = hashAuthoredCharacter(authored)
  const statement = snapshot.character.personality.personality
  const [revision] = await db.insert(characterRevisions).values({
    characterId: loaded.characterId, sourceHash, authored,
    profile: { character: snapshot.character, worldSetting: snapshot.worldSetting, worldGenre: snapshot.worldGenre },
    status: 'ready', providerMode: 'mock', compiled: { version: 1, sourceHash, rules: [{
      id: 'respect', domain: 'value', statement, source: { field: 'personality.personality', start: 0, end: statement.length },
      origin: 'explicit', confidence: 1, priority: 1,
    }] },
  }).returning()
  return revision!
}

async function fixture(): Promise<Fixture> {
  const userId = await user()
  const [character] = await db.insert(characters).values({
    ownerId: userId, name: '지안', personality: value, isPublic: true,
    initialRelationship: { trust: 15, stage: 'stranger' }, sampleDialogue: [],
  }).returning()
  await db.insert(worlds).values({ characterId: character!.id, location: '서울', worldSetting: '현대 서울의 작업실' })
  // Seed an existing session before the opt-in rollout. This avoids the separate
  // start-session compiler scheduling path making any provider calls in DB tests.
  const mode = process.env.MIRO_CHARACTER_AGENCY_MODE
  vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
  let sessionId: string
  try { ({ sessionId } = await createRoleplaySession(userId, character!.id)) }
  finally { vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', mode) }
  const loaded = (await loadSession(sessionId, userId))!
  await readyRevision(loaded)
  return { userId, sessionId, loaded }
}

async function runtime(f: Fixture) {
  const result = await loadAgencyRuntime(f.sessionId, f.userId, f.loaded.snapshot, unusedProvider)
  expect(result).not.toBeNull()
  return result!
}

/** goalIds are cited and, unless fulfill is false, carried out by this reply. */
type PlanOptions = { goalIds?: string[]; fulfill?: boolean; newGoals?: number; cancelGoal?: string; activateGoal?: string }
async function planned(f: Fixture, loaded: LoadedAgency, options: PlanOptions = {}, fullTurn = false) {
  const input = { id: randomUUID(), text: options.cancelGoal ? '오늘 약속은 취소할게.' : '약속한 이야기를 들려줘.' }
  const now = new Date(Math.max(Date.now(), Date.parse(loaded.state.updatedAt) + 1))
  const evidence = await loadAgencyEvidence(f.sessionId, f.loaded.snapshot, loaded, input, now)
  const ids = [input.id]
  const llm: LLMProvider = { info: { name: 'recorded-db-contract', mode: 'mock', notice: 'Recorded contract, not model quality' }, async generateStructured(request) {
    if (request.promptVersion === 'agency-dialogue:v4') return request.schema.parse({ rp: { blocks: [{ type: 'dialogue', speaker: '지안', text: reply }] } })
    if (request.promptVersion === 'agency-realization-check:v4') return request.schema.parse({
      decisionId: JSON.parse(request.prompt).decision.id, aligned: true, claims: [], unsupported: [], violations: [],
    })
    return request.schema.parse({
      appraisal: { interpretation: '사용자가 약속에 대해 이야기했다.', evidenceIds: ids, ruleIds: ['respect'],
        goalCongruence: 1, valueConflict: 0, responsibility: 'self',
        affectDelta: { valence: 0, arousal: 0, stress: 2, energy: 0 }, expression: { openness: 40, directness: 60 }, beliefs: [],
        relationshipChanges: [{ dimension: 'trust', delta: 1, evidenceIds: ids, ruleIds: ['respect'] }],
      },
      candidates: [{ id: 'answer', action: options.cancelGoal ? 'cancel_commitment' : 'respond',
        description: options.cancelGoal ? '사용자의 약속 취소를 받아들인다.' : '약속한 이야기를 답장한다.', targetActor: f.loaded.characterId,
        evidenceIds: ids, ruleIds: ['respect'], goalIds: options.cancelGoal ? [options.cancelGoal] : options.goalIds ?? [],
        fulfillsGoalIds: options.cancelGoal || options.fulfill === false ? [] : options.goalIds ?? [],
        ruleFit: [{ ruleId: 'respect', fit: 1 }], goalFit: [], preconditions: [], uncertainty: 0, cost: 0,
      }],
      newGoals: Array.from({ length: options.newGoals ?? 0 }, (_, index) => ({
        id: `untrusted-proposal-${index}`, description: `약속한 다음 이야기 ${index}`, evidenceIds: ids, ruleIds: ['respect'], priority: .7, success: 'sent',
      })),
      goalChanges: options.cancelGoal ? [{ kind: 'cancel', goalId: options.cancelGoal, evidenceIds: ids }]
        : options.activateGoal ? [{ kind: 'activate', goalId: options.activateGoal, evidenceIds: ids }] : [],
    })
  } }
  const context = {
    sessionId: f.sessionId, revisionId: loaded.revision.id, actor: f.loaded.characterId, evidence,
    authored: loaded.revision.authored,
    clock: { now: now.toISOString(), mode: 'real_time' as const, trigger: 'user' as const, allowOfflineAdvance: false },
    permissions: { contact: false, capabilities: ['respond', 'cancel_commitment', 'wait'] },
  }
  const turn = fullTurn ? await runTurn({ llm, snapshot: f.loaded.snapshot, userInput: input.text,
    agency: { mode: 'live', compiled: loaded.revision.compiled, state: loaded.state, context },
  }) : undefined
  const plan = turn?.agency!.plan ?? await planAgencyDecision(llm, loaded.revision.compiled, loaded.state, context)
  expect(plan.issues).toEqual([])
  return { input, plan, turn }
}

function commitInput(f: Fixture, loaded: LoadedAgency, p: { input: { id: string; text: string }; plan: AgencyPlan; turn?: TurnResult }): CommitInput {
  const s = f.loaded.snapshot
  const transition: ValidatedTransition = p.turn?.transition ?? {
    blocks: [{ type: 'dialogue', speaker: '지안', text: reply }], worldDelta: null, relationshipDelta: p.plan.relationshipDelta,
    sceneDelta: null, memories: [], newEvent: null, eventUpdates: [], npcIntroductions: [], npcActions: [],
    realityIntent: null, emotion: undefined, intent: undefined, issues: [],
  }
  return { sessionId: f.sessionId, characterId: f.loaded.characterId, userInput: p.input.text, userMessageId: p.input.id,
    responseText: reply, turnIndex: s.turnCount + 1, blocks: transition.blocks, transition,
    worldVersion: s.world.version, relationshipVersion: s.relationship.version,
    currentRelationship: s.relationship, existingMemories: s.memories, agency: { version: loaded.version, plan: p.plan },
  }
}

async function persisted(sessionId: string) {
  const [runtime] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, sessionId))
  const [world] = await db.select().from(worldStates).where(eq(worldStates.sessionId, sessionId))
  const [relationship] = await db.select().from(relationships).where(eq(relationships.sessionId, sessionId))
  const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId))
  return { runtime, world, relationship, session,
    messages: await db.select().from(messages).where(eq(messages.sessionId, sessionId)),
    decisions: await db.select().from(characterDecisions).where(eq(characterDecisions.sessionId, sessionId)),
  }
}

async function seedGoal(f: Fixture, loaded: LoadedAgency, success: AgencyGoal['success'] = 'sent') {
  const proofId = randomUUID()
  await db.insert(messages).values({ id: proofId, sessionId: f.sessionId, role: 'user', content: '다음에 이야기해 줘.', turnIndex: 0 })
  const goal: AgencyGoal = { id: 'goal:0:0', description: '약속한 이야기를 전한다.', evidenceIds: [proofId], ruleIds: ['respect'], priority: .8,
    status: 'active', success, createdAt: loaded.state.updatedAt, updatedAt: loaded.state.updatedAt }
  const state = { ...loaded.state, goals: [goal] }
  await db.update(characterRuntimeStates).set({ state }).where(eq(characterRuntimeStates.sessionId, f.sessionId))
  return { ...loaded, state }
}

describeDb('agency runtime and atomic persistence (local test database)', () => {
  beforeEach(() => {
    vi.stubEnv('MIRO_MODE', 'alpha')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '*')
  })
  afterEach(() => { vi.unstubAllEnvs() })
  afterAll(async () => {
    for (const id of createdUsers) await db.delete(users).where(eq(users.id, id))
  })

  it('does not touch the database while disabled, or for a session outside the cohort', async () => {
    const f = await fixture()
    for (const [mode, cohort] of [['off', '*'], ['live', randomUUID()]]) {
      vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', mode!)
      vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', cohort!)
      databaseAccess.methods = []
      expect(await loadAgencyRuntime(f.sessionId, f.userId, f.loaded.snapshot, unusedProvider)).toBeNull()
      expect(databaseAccess.methods).toEqual([])
    }
  })

  it('denies a non-owner without creating a runtime, then allows the actual owner', async () => {
    const f = await fixture()
    expect(await loadAgencyRuntime(f.sessionId, await user(), f.loaded.snapshot, unusedProvider)).toBeNull()
    expect(await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, f.sessionId))).toHaveLength(0)
    expect((await runtime(f)).mode).toBe('live')
  })

  it('does not persist shadow state for either a new or previously live session', async () => {
    const f = await fixture()
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'shadow')
    const shadow = await runtime(f)
    expect(shadow.mode).toBe('shadow')
    await planned(f, shadow, { newGoals: 1 })
    expect((await persisted(f.sessionId)).runtime).toBeUndefined()
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    await runtime(f)
    const before = await persisted(f.sessionId)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'shadow')
    const existing = await runtime(f)
    expect(existing.mode).toBe('shadow')
    await planned(f, existing, { newGoals: 1 })
    expect(await persisted(f.sessionId)).toEqual(before)
  })

  it('pins an existing session to its original authored revision after the creator edits', async () => {
    const f = await fixture()
    const first = await runtime(f)
    await db.update(characters).set({ personality: '솔직하게 말하며 개인의 시간을 지킨다.', name: '지안 수정' }).where(eq(characters.id, f.loaded.characterId))
    f.loaded = (await loadSession(f.sessionId, f.userId))!
    const edited = await readyRevision(f.loaded)
    const stillPinned = await runtime(f)
    expect(stillPinned.revision.id).toBe(first.revision.id)
    expect(stillPinned.revision.profile.character.identity.name).toBe('지안')
    expect(stillPinned.revision.compiled.rules[0]!.statement).toBe(value)
    const otherUser = await user()
    const other = await createRoleplaySession(otherUser, f.loaded.characterId)
    const otherLoaded = (await loadSession(other.sessionId, otherUser))!
    const newRuntime = await loadAgencyRuntime(other.sessionId, otherUser, otherLoaded.snapshot, unusedProvider)
    expect(newRuntime!.revision.id).toBe(edited.id)
    expect(newRuntime!.revision.profile.character.identity.name).toBe('지안 수정')
  })

  it('reloads retained real message evidence but excludes hidden, cross-session and narrator knowledge', async () => {
    const f = await fixture(), other = await fixture()
    const loaded = await runtime(f)
    const [own, hidden, foreign, narrator] = await db.insert(messages).values([
      { sessionId: f.sessionId, role: 'user' as const, content: '이전에 실제로 한 말', turnIndex: 1 },
      { sessionId: f.sessionId, role: 'user' as const, content: '숨겨진 말', hiddenAt: new Date(), turnIndex: 1 },
      { sessionId: other.sessionId, role: 'user' as const, content: '다른 사람의 비밀', turnIndex: 1 },
      { sessionId: f.sessionId, role: 'narrator' as const, content: '캐릭터가 모르는 서술', turnIndex: 1 },
    ]).returning()
    loaded.state.beliefs = [{ id: 'retained', statement: '아직 확인하지 않은 주장', evidenceIds: [own!.id, hidden!.id, foreign!.id, narrator!.id], confidence: .5, status: 'active', updatedAt: loaded.state.updatedAt }]
    // Deliberately use the old recent window: the retained evidence must come from the DB.
    const evidence = await loadAgencyEvidence(f.sessionId, f.loaded.snapshot, loaded)
    expect(evidence.map(e => e.id)).toEqual([own!.id])
    expect(evidence[0]).toMatchObject({ kind: 'message', epistemic: 'reported', actor: 'user', quote: own!.content })
  })

  it('persists the same real user-message ID in the decision, goal and later evidence retrieval', async () => {
    const f = await fixture(), loaded = await runtime(f)
    const p = await planned(f, loaded, { newGoals: 1 })
    await commitTurn(commitInput(f, loaded, p))
    const saved = await persisted(f.sessionId)
    expect(saved.messages.map(m => m.id)).toContain(p.input.id)
    expect(saved.runtime!.state.goals[0]!.evidenceIds).toEqual([p.input.id])
    expect(saved.runtime!.state.goals[0]!.status).toBe('proposed')
    expect(saved.decisions[0]!.decision.candidate.evidenceIds).toEqual([p.input.id])
    expect(saved.runtime!.version).toBe(1)
    expect(saved.world!.version).toBe(f.loaded.snapshot.world.version + 1)
    expect(saved.relationship!.trust).toBe(16)
    const restored = await runtime(f)
    const evidence = await loadAgencyEvidence(f.sessionId, f.loaded.snapshot, restored)
    expect(evidence.find(e => e.id === p.input.id)?.quote).toBe(p.input.text)
    // Replaying the persisted evidence does not repeatedly modify feelings.
    expect(restored.state.appraisedEvidenceIds).toContain(p.input.id)
  })

  it('allows one concurrent commit and fully rolls back the stale competitor and subsequent retry', async () => {
    const f = await fixture(), loaded = await runtime(f)
    const a = commitInput(f, loaded, await planned(f, loaded, { newGoals: 1 }))
    const b = commitInput(f, loaded, await planned(f, loaded, { newGoals: 1 }))
    const results = await Promise.allSettled([commitTurn(a), commitTurn(b)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(StaleStateError)
    const saved = await persisted(f.sessionId)
    expect(saved.messages).toHaveLength(2)
    expect(saved.decisions).toHaveLength(1)
    expect(saved.runtime!.version).toBe(1)
    expect(saved.runtime!.state.goals).toHaveLength(1)
    expect(saved.world!.version).toBe(f.loaded.snapshot.world.version + 1)
    expect(saved.relationship!.version).toBe(f.loaded.snapshot.relationship.version + 1)
    expect(saved.relationship!.trust).toBe(16)
    expect(saved.session!.turnCount).toBe(1)
    await expect(commitTurn(results[0]!.status === 'fulfilled' ? a : b)).rejects.toBeInstanceOf(StaleStateError)
    expect(await persisted(f.sessionId)).toEqual(saved)
  })

  it('rolls back messages and relationship when only the agency version becomes stale', async () => {
    const f = await fixture(), loaded = await runtime(f)
    const input = commitInput(f, loaded, await planned(f, loaded))
    await db.update(characterRuntimeStates).set({ version: 1 }).where(eq(characterRuntimeStates.sessionId, f.sessionId))
    const before = await persisted(f.sessionId)
    await expect(commitTurn(input)).rejects.toBeInstanceOf(StaleStateError)
    expect(await persisted(f.sessionId)).toEqual(before)
  })

  it('honors a kill switch changed after generation and rolls back every attempted write', async () => {
    const f = await fixture(), loaded = await runtime(f)
    const input = commitInput(f, loaded, await planned(f, loaded))
    const before = await persisted(f.sessionId)
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    await expect(commitTurn(input)).rejects.toBeInstanceOf(StaleStateError)
    expect(await persisted(f.sessionId)).toEqual(before)
  })

  it('completes a sent goal from the actual persisted reply while keeping all three new proposals', async () => {
    const f = await fixture()
    const loaded = await seedGoal(f, await runtime(f))
    const p = await planned(f, loaded, { goalIds: [loaded.state.goals[0]!.id], newGoals: 3 })
    const committed = await commitTurn(commitInput(f, loaded, p))
    const saved = await persisted(f.sessionId)
    const responseId = committed.messages.find(m => m.role === 'character')!.id
    const receiptId = `${responseId}:sent`
    expect(saved.runtime!.state.goals).toHaveLength(4)
    expect(saved.runtime!.state.goals[0]).toMatchObject({ status: 'completed', outcomeEvidenceId: receiptId })
    expect(saved.runtime!.state.goals.slice(1).every(g => g.status === 'proposed')).toBe(true)
    expect(saved.runtime!.state.actions[0]).toMatchObject({ status: 'sent', outcomeEvidenceId: receiptId, fulfillsGoalIds: [loaded.state.goals[0]!.id] })
    // Re-enter the session: the reply is now in the recent window, next to its receipt.
    f.loaded = (await loadSession(f.sessionId, f.userId))!
    const evidence = await loadAgencyEvidence(f.sessionId, f.loaded.snapshot, await runtime(f))
    // The character keeps what it actually said; the receipt sits beside it under its own ID.
    expect(evidence.find(e => e.id === responseId)).toMatchObject({ kind: 'message', quote: reply })
    expect(evidence.find(e => e.id === receiptId)).toMatchObject({ kind: 'outcome', epistemic: 'observed', outcomeStatus: 'sent' })
    expect(evidence.find(e => e.id === receiptId)?.quote).toContain('does not prove receipt or reading')
  })

  it('keeps a promise open when the reply only mentions it', async () => {
    const f = await fixture()
    const loaded = await seedGoal(f, await runtime(f))
    await commitTurn(commitInput(f, loaded, await planned(f, loaded, { goalIds: [loaded.state.goals[0]!.id], fulfill: false })))
    const saved = await persisted(f.sessionId)
    expect(saved.runtime!.state.goals[0]!.status).toBe('active')
    expect(saved.runtime!.state.actions).toEqual([])
    expect(saved.decisions[0]!.decision.candidate.goalIds).toEqual([loaded.state.goals[0]!.id])
  })

  it('keeps a live cohort session on the existing conversation until its pinned revision compiles', async () => {
    const f = await fixture()
    await db.update(characterRevisions).set({ status: 'pending', compiled: null, providerMode: null }).where(eq(characterRevisions.characterId, f.loaded.characterId))
    deferred.tasks = []
    const input = { id: randomUUID(), text: '안녕하세요.' }
    const pending = await prepareAgencyTurn(f.sessionId, f.userId, f.loaded.snapshot, unusedProvider, input)
    expect(pending).toEqual({ runtime: null, snapshot: f.loaded.snapshot, agency: undefined })
    expect(deferred.tasks).toHaveLength(1) // the compile is scheduled in the background
    const [pinned] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, f.sessionId))
    const [revision] = await db.select().from(characterRevisions).where(eq(characterRevisions.id, pinned!.revisionId))
    expect(revision!.status).toBe('pending')
    // A revision that exhausted its attempts keeps the session on the old path instead of failing every turn.
    await db.update(characterRevisions).set({ status: 'failed', attempts: 3, leaseUntil: new Date(0) }).where(eq(characterRevisions.id, revision!.id))
    deferred.tasks = []
    expect((await prepareAgencyTurn(f.sessionId, f.userId, f.loaded.snapshot, unusedProvider, input)).agency).toBeUndefined()
    expect(deferred.tasks).toEqual([])
  })

  it('never upgrades a persisted reply to delivered or answered, or completes a delivery-dependent goal', async () => {
    const f = await fixture()
    const loaded = await seedGoal(f, await runtime(f), 'delivered')
    // The app attests only queued/sent receipts, so the planner never lets a reply claim to fulfil a
    // delivery-dependent goal (see the planner test); citing it leaves the goal open and adds no receipt.
    await commitTurn(commitInput(f, loaded, await planned(f, loaded, { goalIds: [loaded.state.goals[0]!.id], fulfill: false })))
    const saved = await persisted(f.sessionId)
    expect(saved.runtime!.state.goals[0]!.status).toBe('active')
    expect(saved.runtime!.state.actions).toEqual([])
  })

  it('persists user cancellation and does not create a fictional delivery receipt', async () => {
    const f = await fixture()
    const loaded = await seedGoal(f, await runtime(f))
    const p = await planned(f, loaded, { cancelGoal: loaded.state.goals[0]!.id })
    await commitTurn(commitInput(f, loaded, p))
    const restored = await runtime(f)
    expect(restored.state.goals[0]!.status).toBe('cancelled')
    expect(restored.state.goals[0]!.evidenceIds).toContain(p.input.id)
    expect(restored.state.actions).toEqual([])
  })

  it('replays persisted turns through runTurn with recorded outputs across fresh runtime loads (not model quality)', async () => {
    const turns = Number(process.env.MIRO_AGENCY_REPLAY_TURNS ?? '20')
    expect([20, 100, 300]).toContain(turns)
    const f = await fixture(), other = await fixture()
    const initial = await seedGoal(f, await runtime(f))
    const cancelledId = initial.state.goals[0]!.id
    const [foreign] = await db.insert(messages).values({ sessionId: other.sessionId, role: 'user', content: 'OTHER_SESSION_PRIVATE_CANARY', turnIndex: 0 }).returning()
    const otherBefore = await persisted(other.sessionId)
    let lastSequence = 0
    for (let turn = 0; turn < turns; turn++) {
      // Each iteration represents re-entry/restart: fetch session, pinned revision,
      // JSON state and retained source rows from Postgres, never the previous plan.
      f.loaded = (await loadSession(f.sessionId, f.userId))!
      const loaded = await runtime(f)
      expect(loaded.version).toBe(turn)
      expect(loaded.state.sequence).toBe(lastSequence)
      expect(loaded.state.goals.find(g => g.id === cancelledId)?.status ?? 'cancelled').toBe(turn === 0 ? 'active' : 'cancelled')
      const evidence = await loadAgencyEvidence(f.sessionId, f.loaded.snapshot, loaded)
      expect(evidence.some(e => e.id === foreign!.id || e.quote.includes('OTHER_SESSION_PRIVATE_CANARY'))).toBe(false)
      const pending = loaded.state.goals.find(g => g.status === 'proposed')
      const active = loaded.state.goals.find(g => g.status === 'active')
      const options: PlanOptions = turn === 0 ? { cancelGoal: cancelledId }
        : pending ? { activateGoal: pending.id } : active ? { goalIds: [active.id] } : { newGoals: 1 }
      const p = await planned(f, loaded, options, true)
      expect(p.turn!.agency!.verification.ok).toBe(true)
      if (turn > 0) expect(p.plan.decision.candidate.goalIds).not.toContain(cancelledId)
      await commitTurn(commitInput(f, loaded, p))
      const saved = await persisted(f.sessionId)
      lastSequence = saved.runtime!.state.sequence
      expect(saved.runtime!.version).toBe(turn + 1)
      expect(saved.runtime!.state.goals.length).toBeLessThanOrEqual(24)
      expect(saved.runtime!.state.actions.length).toBeLessThanOrEqual(48)
      expect(saved.runtime!.state.actions.every(a => a.status === 'sent')).toBe(true)
      expect(saved.runtime!.state.goals.find(g => g.id === cancelledId)?.status ?? 'cancelled').toBe('cancelled')
    }
    const final = await persisted(f.sessionId)
    expect(final.decisions).toHaveLength(turns)
    expect(final.messages).toHaveLength(turns * 2 + 1)
    expect(final.session!.turnCount).toBe(turns)
    expect(final.decisions.some(d => d.decision.action === 'cancel_commitment' && d.decision.candidate.goalIds.includes(cancelledId))).toBe(true)
    expect(await persisted(other.sessionId)).toEqual(otherBefore)
  }, 120_000)

  it('keeps all private agency tables under RLS without PUBLIC, anon or authenticated grants', async () => {
    const tables = await db.execute<{ relname: string; relrowsecurity: boolean; public_grants: number }>(sql`
      select c.relname, c.relrowsecurity,
        (select count(*)::int from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl where acl.grantee = 0) as public_grants
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('character_revisions', 'character_runtime_states', 'character_decisions')`)
    expect(tables).toHaveLength(3)
    expect(tables.every(t => t.relrowsecurity && t.public_grants === 0)).toBe(true)
    const grants = await db.execute<{ rolname: string; relname: string; can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>(sql`
      select r.rolname, c.relname, has_table_privilege(r.oid, c.oid, 'SELECT') as can_select,
        has_table_privilege(r.oid, c.oid, 'INSERT') as can_insert, has_table_privilege(r.oid, c.oid, 'UPDATE') as can_update,
        has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete
      from pg_roles r cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
      where r.rolname in ('anon', 'authenticated') and n.nspname = 'public'
        and c.relname in ('character_revisions', 'character_runtime_states', 'character_decisions')`)
    // A plain Postgres test database may omit API roles; still validate PUBLIC and RLS above.
    expect(grants.every(g => !g.can_select && !g.can_insert && !g.can_update && !g.can_delete)).toBe(true)
    const policies = await db.execute(sql`select policyname from pg_policies where schemaname = 'public'
      and tablename in ('character_revisions', 'character_runtime_states', 'character_decisions')`)
    expect(policies).toHaveLength(0)
  })
})
