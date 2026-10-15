import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, userPersonas, roleplaySessions, characters, worlds, messages } from '@miro/db'
import { createRoleplaySession } from '@/lib/simulation/start'
import { loadSession } from '@/lib/simulation/snapshot'
import { loadRealityContext } from '@/lib/reality/context'
import { deleteAccount } from '@/lib/ops/account'
import { getConversationPersona, saveConversationPersona, getPersona, parsePersona, personaNext, requirePersonaPath, savePersona } from '../persona'
import * as providers from '@miro/providers'
import { setHomeUnveilFor } from '../home-mode'
import { testDatabaseUrl } from '../../../../tooling/test-database'

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
afterAll(async () => { for (const id of made) await db.delete(users).where(eq(users.id, id)) })
async function user() {
  const [u] = await db.insert(users).values({ email: `persona-${randomUUID()}@example.test` }).returning({ id: users.id })
  made.push(u!.id)
  return u!.id
}

describe('페르소나 입력', () => {
  it('needs a name, bounds the lengths, and keeps only known genders', () => {
    expect(parsePersona({ name: '  ', gender: '', description: '' })).toEqual({ ok: false, error: '이름을 적어 주세요.' })
    expect(parsePersona({ name: '가'.repeat(13), gender: '', description: '' }).ok).toBe(false)
    expect(parsePersona({ name: '지우', gender: '', description: '가'.repeat(301) }).ok).toBe(false)
    expect(parsePersona({ name: ' 지  우 ', gender: 'robot', description: '  ' })).toEqual({ ok: true, persona: { name: '지 우', gender: null, description: null } })
    expect(parsePersona({ name: '지우', gender: 'female', description: '편집자' })).toEqual({ ok: true, persona: { name: '지우', gender: 'female', description: '편집자' } })
    // 제어 문자(NUL 등)는 DB 가 받지 않는다 — 공백으로 바뀌어 모인다.
    expect(parsePersona({ name: '지\u0000우', gender: '', description: 'a\u0007b' })).toEqual({ ok: true, persona: { name: '지 우', gender: null, description: 'a b' } })
  })

  it('only returns to a chat, a message thread or My page — never an outside address', () => {
    const id = randomUUID()
    expect(personaNext(`/chat/${id}`)).toBe(`/chat/${id}`)
    expect(personaNext(`/messages/${id}`)).toBe(`/messages/${id}`)
    for (const bad of ['//evil.example', 'https://evil.example', '/chat/../admin', '/home', undefined, 42]) expect(personaNext(bad)).toBe('/my')
    expect(requirePersonaPath(`/chat/${id}`)).toBe(`/persona?next=${encodeURIComponent(`/chat/${id}`)}`)
  })
})

describeDb('페르소나 저장과 쓰임', () => {
  // 10/2: AI 안전 검사를 뺐다 — 저장은 입력 형식만 본다(AI 를 부르지 않는다).
  it('saves, updates in place, and refuses only malformed input', async () => {
    const id = await user()
    expect(await getPersona(id)).toBeNull()
    expect(await savePersona(id, { name: '지우', gender: 'female', description: '출판사 편집자' })).toEqual({ ok: true })
    expect(await savePersona(id, { name: '지우', gender: '', description: '' })).toEqual({ ok: true })
    expect(await getPersona(id)).toEqual({ name: '지우', gender: null, description: null })
    expect(await db.select().from(userPersonas).where(eq(userPersonas.userId, id))).toHaveLength(1)
    expect(await savePersona(id, { name: '  ', gender: '', description: '' })).toEqual({ ok: false, error: '이름을 적어 주세요.' })
    expect((await getPersona(id))?.name).toBe('지우')
  })

  it('reaches the conversation snapshot and the proactive message grounding, and is removed with the account', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    const id = await user()
    const { sessionId } = await createRoleplaySession(id, 'thomas')
    expect((await loadSession(sessionId, id))!.snapshot.userPersona).toBeNull()
    await savePersona(id, { name: '지우', gender: 'female', description: '출판사 편집자' })
    expect((await loadSession(sessionId, id))!.snapshot.userPersona).toEqual({ name: '지우', gender: 'female', description: '출판사 편집자' })
    expect((await loadRealityContext(sessionId, id, '안부'))!.userPersona).toEqual(['이름: 지우', '성별: 여성', '소개: 출판사 편집자'])
    expect(await deleteAccount(id)).toBe('completed')
    expect(await getPersona(id)).toBeNull()
  })
})

describeDb('대화방별 페르소나', () => {
  it('requires room confirmation even with a global default and isolates characters and proactive contact', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    const id = await user()
    await savePersona(id, { name: '공용', gender: '', description: '기본 설정' })
    const a = await createRoleplaySession(id, 'thomas'), b = await createRoleplaySession(id, 'yujin')
    expect((await loadSession(a.sessionId, id))!.personaConfigured).toBe(false)
    expect(await saveConversationPersona(id, a.sessionId, { name: '서연', gender: 'female', description: '서른 살 기록 연구원' })).toEqual({ ok: true })
    expect((await loadSession(a.sessionId, id))!).toMatchObject({ personaConfigured: true, snapshot: { userPersona: { name: '서연' } } })
    expect((await loadRealityContext(a.sessionId, id, '안부'))!.userPersona).toContain('이름: 서연')
    expect((await getConversationPersona(id, b.sessionId))?.name).toBe('공용')
    expect((await loadSession(b.sessionId, id))!.personaConfigured).toBe(false)
    await savePersona(id, { name: '다른기본', gender: '', description: '' })
    expect((await getConversationPersona(id, a.sessionId))?.name).toBe('서연')
  })
  it('refuses invalid input, someone else’s room, and deleted rooms', async () => {
    const id = await user(), other = await user()
    const { sessionId } = await createRoleplaySession(id, 'thomas')
    const values = { name: '지우', gender: '', description: '' }
    expect((await saveConversationPersona(other, sessionId, values)).ok).toBe(false)
    expect(await getConversationPersona(other, sessionId)).toBeNull()
    expect((await saveConversationPersona(id, sessionId, { ...values, name: '' })).ok).toBe(false)
    await db.update(roleplaySessions).set({ deletedAt: new Date() }).where(eq(roleplaySessions.id, sessionId))
    expect((await saveConversationPersona(id, sessionId, values)).ok).toBe(false)
  })
  it('adopts the name in untouched authored openings while preserving played dialogue', async () => {
    const id = await user()
    await savePersona(id, { name: '기본', gender: '', description: '' })
    const [c] = await db.insert(characters).values({ ownerId: id, name: '안내인', personality: '차분하다', experienceType: 'chat', sampleDialogue: [{ role: 'narrator', purpose: 'intro', text: '당신이 기록실에 들어섰다.' }] }).returning()
    await db.insert(worlds).values({ characterId: c!.id })
    const { sessionId } = await createRoleplaySession(id, c!.id)
    await saveConversationPersona(id, sessionId, { name: '서연', gender: '', description: '' })
    expect(await loadSession(sessionId, id)).toMatchObject({ personaConfigured: true, experienceType: 'chat', snapshot: { userPersona: { name: '서연' } } })
    const [opening] = await db.select().from(messages).where(eq(messages.sessionId, sessionId))
    expect(opening!.content).toBe('서연이 기록실에 들어섰다.')
    await db.update(roleplaySessions).set({ turnCount: 1 }).where(eq(roleplaySessions.id, sessionId))
    await saveConversationPersona(id, sessionId, { name: '다른이름', gender: '', description: '' })
    expect((await db.select().from(messages).where(eq(messages.id, opening!.id)))[0]!.content).toBe(opening!.content)
  })
  it('keeps normal and unveil personas separate and rejects a minor persona in an unveil room', async () => {
    const id = await user()
    await db.update(users).set({ adultVerifiedAt: new Date(), maturePolicyAgreedAt: new Date() }).where(eq(users.id, id))
    vi.spyOn(providers, 'adultModelReady').mockReturnValue(true)
    const a = await createRoleplaySession(id, 'thomas'), b = await createRoleplaySession(id, 'thomas', { unveil: true })
    await saveConversationPersona(id, a.sessionId, { name: '지우', gender: '', description: '기록 연구원' })
    await saveConversationPersona(id, b.sessionId, { name: '서연', gender: '', description: '서른 살 편집자' })
    expect((await saveConversationPersona(id, b.sessionId, { name: '서연', gender: '', description: '열여섯 살 고등학생' })).ok).toBe(false)
    expect((await getConversationPersona(id, a.sessionId))?.name).toBe('지우')
    expect((await getConversationPersona(id, b.sessionId))?.name).toBe('서연')
    await setHomeUnveilFor(id, true)
    expect(await loadSession(b.sessionId, id)).toMatchObject({ personaConfigured: true, snapshot: { userPersona: { name: '서연' }, adultMode: true } })
  })
})
