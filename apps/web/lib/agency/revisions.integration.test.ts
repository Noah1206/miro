import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { db, characters, characterRevisions, characterRuntimeStates, roleplaySessions, users } from '@miro/db'
import { hashAuthoredCharacter } from '@miro/engine'
import { saveCharacter } from '@/app/(main)/create/actions'
import { updateCharacter } from '@/app/(main)/my/characters/[id]/edit/actions'
import { createRoleplaySession } from '@/lib/simulation/start'
import { loadSession } from '@/lib/simulation/snapshot'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'
import { captureAgencyRevision, pinAgencyRevision, scheduleAgencyCompilation } from './revisions'
import { loadAgencyRuntime } from './runtime'

const effects = vi.hoisted(() => ({
  userId: '', tasks: [] as Array<() => Promise<unknown>>, contexts: [] as Array<Record<string, unknown>>, generations: 0,
}))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: effects.userId }) }))
vi.mock('@/lib/storage/images', () => ({ resolveCharacterImages: async () => [] }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) }, notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/lib/defer', () => ({ afterResponse: async (task: () => Promise<unknown>) => { effects.tasks.push(task) } }))
// Synthetic recorded extraction exercises the actual compiler, lease worker and database; never a paid provider.
vi.mock('@/lib/simulation/mock-llm', () => ({ resolveRpLLM: (_name: string, context: Record<string, unknown>) => {
  effects.contexts.push(context)
  return {
    info: { mode: 'mock', name: 'revision-recorded-extraction', notice: 'Synthetic fixture, not live model evaluation.' },
    async generateStructured(opts: { prompt: string; schema: { parse(value: unknown): unknown } }) {
      effects.generations++
      const { document } = JSON.parse(opts.prompt)
      const quote = document.fields['personality.personality']
      return opts.schema.parse({ rules: [{ id: 'authored-personality', domain: 'value', statement: quote,
        source: { field: 'personality.personality', quote }, origin: 'explicit', confidence: 1 }], unresolved: [] })
    },
  }
} }))

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const owners: string[] = []
async function newUser() {
  const [user] = await db.insert(users).values({ email: `agency-revision-${randomUUID()}@example.test` }).returning()
  owners.push(user!.id)
  return user!.id
}
function form(personality = '약속을 지키고 감정을 절제한다.') {
  const value = new FormData()
  for (const [key, text] of Object.entries({ name: '리비전', title: '소개', personality, mood: '드라마',
    startingContext: '서울의 서점에서 만난다.', worldSetting: '현대 서울의 서점.', jealousy: '50', initiative: '50', emotionalExpression: '50', isPublic: 'on' })) value.set(key, text)
  return value
}
async function save(value = form()) {
  effects.userId = await newUser()
  await expect(saveCharacter(value)).rejects.toThrow('REDIRECT:/chat/')
  const [character] = await db.select().from(characters).where(eq(characters.ownerId, effects.userId))
  const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.characterId, character!.id))
  return { character: character!, session: session!, userId: effects.userId }
}
async function revisions(characterId: string) {
  return db.select().from(characterRevisions).where(eq(characterRevisions.characterId, characterId)).orderBy(asc(characterRevisions.createdAt))
}
async function flush() {
  const tasks = effects.tasks.splice(0)
  for (const task of tasks) await task()
}
beforeEach(() => {
  vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
  vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', '*')
  effects.tasks = []; effects.contexts = []; effects.generations = 0
})
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => {
  for (const ownerId of owners) {
    await db.delete(characters).where(eq(characters.ownerId, ownerId))
    await db.delete(users).where(eq(users.id, ownerId))
  }
})

describe('disabled revision helpers', () => {
  it('touches neither agency tables nor providers in off mode', async () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    const forbidden = new Proxy({}, { get() { throw new Error('database accessed while off') } }) as Parameters<typeof captureAgencyRevision>[0]
    expect(await captureAgencyRevision(forbidden, 'unused')).toBeNull()
    expect(await pinAgencyRevision(forbidden, 'unused', null)).toBe(false)
    await scheduleAgencyCompilation('unused', 'unused')
    expect(effects.tasks).toEqual([])
    expect(effects.contexts).toEqual([])
  })
})

describeDb('authored revision save/edit/start lifecycle', () => {
  it('pins the initial pending source when a legacy session first opts in, even if edited before compilation', async () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    const saved = await save()
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    const snapshot = (await loadSession(saved.session.id, saved.userId))!.snapshot
    const provider = resolveRpLLM('Recorded fixture', { userId: saved.userId })
    expect(await loadAgencyRuntime(saved.session.id, saved.userId, snapshot, provider)).toBeNull()
    const [original] = await revisions(saved.character.id)
    expect(original!.status).toBe('pending')
    const [pin] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, saved.session.id))
    expect(pin!.revisionId).toBe(original!.id)
    await expect(updateCharacter(saved.character.id, form('더 솔직하게 감정을 표현한다.'))).rejects.toThrow('REDIRECT:/character/')
    await flush()
    const fresh = (await loadSession(saved.session.id, saved.userId))!.snapshot
    expect(fresh.character.personality.personality).toBe('더 솔직하게 감정을 표현한다.')
    const runtime = await loadAgencyRuntime(saved.session.id, saved.userId, fresh, provider)
    expect(runtime!.revision.id).toBe(original!.id)
    expect(runtime!.revision.profile.character.personality.personality).toBe(saved.character.personality)
  })

  it('captures and pins before async compile, preserving old sessions through an edit and a no-op save', async () => {
    const firstForm = form()
    firstForm.set('jealousy', '80'); firstForm.append('agencyExplicitField', 'personality.jealousy')
    const saved = await save(firstForm)
    const [first] = await revisions(saved.character.id)
    expect(first!.status).toBe('pending')
    expect(first!.sourceHash).toBe(hashAuthoredCharacter(first!.authored))
    expect(first!.authored.explicitFields).toContain('personality.jealousy')
    expect(first!.authored.explicitFields).not.toContain('personality.initiative')
    expect(first!.authored.explicitFields).not.toContain('personality.emotionalExpression')
    expect(first!.profile.worldGenre).toBe('드라마')
    expect(first!.authored.fields.worldGenre).toBe('드라마')
    expect(first!.profile.character.appearance).toBeDefined()
    const [pinned] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, saved.session.id))
    expect(pinned!.revisionId).toBe(first!.id)
    expect(effects.generations).toBe(0)

    // Editing before the original compilation finishes must not change the session's source.
    const changed = form('잘못을 인정하고 사과한다.')
    changed.set('jealousy', '80'); changed.set('initiative', '20')
    changed.set('mood', '미스터리'); changed.append('agencyExplicitField', 'personality.initiative')
    await expect(updateCharacter(saved.character.id, changed)).rejects.toThrow('REDIRECT:/character/')
    const [original, second] = await revisions(saved.character.id)
    expect(original).toEqual(first)
    expect(second!.authored.explicitFields).toEqual(expect.arrayContaining(['personality.jealousy', 'personality.initiative']))
    expect(second!.sourceHash).not.toBe(first!.sourceHash)
    expect((await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, saved.session.id)))[0]!.revisionId).toBe(first!.id)

    await flush()
    const ready = await revisions(saved.character.id)
    expect(ready.map(row => row.status)).toEqual(['ready', 'ready'])
    expect(ready.map(row => row.providerMode)).toEqual(['mock', 'mock'])
    expect(ready[0]!.compiled!.rules[0]!.statement).toBe(firstForm.get('personality'))
    expect(ready[1]!.compiled!.rules[0]!.statement).toBe(changed.get('personality'))
    expect(effects.contexts.every(context => context.userId === saved.userId && context.workload === 'background' && context.usageUnits === 0)).toBe(true)
    // ai_usage.request_id is a uuid column; anything else makes the budget reservation, and the compile, fail.
    expect(effects.contexts.every(context => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(String(context.requestId)))).toBe(true)

    await expect(updateCharacter(saved.character.id, changed)).rejects.toThrow('REDIRECT:/character/')
    await flush()
    expect(await revisions(saved.character.id)).toEqual(ready)
    expect(effects.generations).toBe(2) // Ready immutable rows cannot be recompiled by repeated saves.

    const viewer = await newUser()
    const next = await createRoleplaySession(viewer, saved.character.id)
    const [newPin] = await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, next.sessionId))
    expect(newPin!.revisionId).toBe(second!.id)
    expect(newPin!.state.sequence).toBe(0)
    expect((await createRoleplaySession(saved.userId, saved.character.id)).sessionId).toBe(saved.session.id)
    expect((await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, saved.session.id)))[0]!.revisionId).toBe(first!.id)
  })

  it('does not promote untouched numeric defaults and rolls profile/revision writes back together', async () => {
    const saved = await save()
    const [initial] = await revisions(saved.character.id)
    for (const field of ['personality.jealousy', 'personality.initiative', 'personality.emotionalExpression']) {
      expect(initial!.authored.fields[field]).toBe('50')
      expect(initial!.authored.explicitFields).not.toContain(field)
    }
    await expect(db.transaction(async tx => {
      await tx.update(characters).set({ personality: '롤백될 설정' }).where(eq(characters.id, saved.character.id))
      const pending = await captureAgencyRevision(tx, saved.character.id)
      expect(pending!.sourceHash).not.toBe(initial!.sourceHash)
      throw new Error('save interrupted')
    })).rejects.toThrow('save interrupted')
    expect(await revisions(saved.character.id)).toEqual([initial])
    expect((await db.select().from(characters).where(eq(characters.id, saved.character.id)))[0]!.personality).toBe(saved.character.personality)
  })

  it('captures shadow sources without inserting or changing a session runtime', async () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'shadow')
    const saved = await save()
    expect(await revisions(saved.character.id)).toHaveLength(1)
    expect(await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, saved.session.id))).toHaveLength(0)
    await flush()
    expect(effects.contexts[0]!.shadow).toBe(true)
    const viewer = await newUser()
    const next = await createRoleplaySession(viewer, saved.character.id)
    expect(await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, next.sessionId))).toHaveLength(0)
  })

  it('with an explicit session cohort, ordinary saves and edits capture and compile nothing until a session is listed', async () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', randomUUID())
    const saved = await save()
    await expect(updateCharacter(saved.character.id, form('편집해도 캡처하지 않는다.'))).rejects.toThrow('REDIRECT:/character/')
    expect(await revisions(saved.character.id)).toEqual([])
    expect(effects.tasks).toEqual([])
    vi.stubEnv('MIRO_CHARACTER_AGENCY_SESSIONS', saved.session.id)
    const snapshot = (await loadSession(saved.session.id, saved.userId))!.snapshot
    expect(await loadAgencyRuntime(saved.session.id, saved.userId, snapshot, resolveRpLLM('Recorded fixture', { userId: saved.userId }))).toBeNull()
    const [captured] = await revisions(saved.character.id)
    expect(captured!.status).toBe('pending')
    expect((await db.select().from(characterRuntimeStates).where(eq(characterRuntimeStates.sessionId, saved.session.id)))[0]!.revisionId).toBe(captured!.id)
    expect(effects.tasks).toHaveLength(1)
    await flush()
    expect((await revisions(saved.character.id))[0]!.status).toBe('ready')
    expect(effects.contexts.at(-1)).toMatchObject({ userId: saved.userId, workload: 'background', usageUnits: 0 })
  })

  it('does not capture or enqueue on ordinary saves when disabled, or on unauthorized edits', async () => {
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'off')
    const saved = await save()
    expect(await revisions(saved.character.id)).toEqual([])
    expect(effects.tasks).toEqual([])
    vi.stubEnv('MIRO_CHARACTER_AGENCY_MODE', 'live')
    effects.userId = await newUser()
    await expect(updateCharacter(saved.character.id, form('남의 캐릭터 변경'))).rejects.toThrow('NOT_FOUND')
    expect(await revisions(saved.character.id)).toEqual([])
    expect(effects.tasks).toEqual([])
  })
})
