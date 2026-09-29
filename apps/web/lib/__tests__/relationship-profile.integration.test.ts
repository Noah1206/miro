import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, characters, roleplaySessions } from '@miro/db'
import { parseRelationshipProfile } from '@miro/domain'
import { saveCharacter } from '@/app/(main)/create/actions'
import { updateCharacter } from '@/app/(main)/my/characters/[id]/edit/actions'
import { loadSession } from '@/lib/simulation/snapshot'
import { profileStatus, refreshRelationshipProfile } from '../relationship-profile'
import { testDatabaseUrl } from '../../../../tooling/test-database'

const auth = vi.hoisted(() => ({ userId: '' }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: auth.userId }) }))
vi.mock('@/lib/storage/images', () => ({ resolveCharacterImages: async () => [] }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) }, notFound: () => { throw new Error('NOT_FOUND') } }))

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => { for (const id of made) { await db.delete(characters).where(eq(characters.ownerId, id)); await db.delete(users).where(eq(users.id, id)) } })

const fields = (over: Record<string, string> = {}) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries({ experienceType: 'reality', name: '강태준', title: '가까이 오면, 끝까지 책임져야 할 텐데.',
    personality: '침착하고 신뢰와 약속을 중시한다. 가까운 사람을 지키려는 책임감이 강하다.', startingContext: '비 오는 밤 사무실',
    introDialogue: '[{"role":"character","text":"늦었네."}]', contactEnabled: 'on', ...over })) fd.set(k, v)
  return fd
}
const row = async (id: string) => (await db.select().from(characters).where(eq(characters.id, id)))[0]!

describeDb('관계 성격표 — 저장 뒤 만들고, 편집기에서 고친 것은 남긴다', () => {
  it('makes the table after a save, keeps author edits, remakes it when the personality changes, and loads it into the turn', async () => {
    vi.stubEnv('AI_PROVIDER', 'mock')
    const [u] = await db.insert(users).values({ email: `profile-${randomUUID()}@example.test` }).returning()
    auth.userId = u!.id; made.push(u!.id)
    const id = randomUUID()
    // 저장 뒤 할 일(afterResponse)은 요청 밖에서는 그 자리에서 끝난다 — 저장이 끝나면 표가 있다.
    await saveCharacter(fields({ creationId: id }))
    const created = profileStatus(await row(id))
    expect(created.status).toBe('ready')
    expect(await refreshRelationshipProfile(id, u!.id)).toBe('fresh')   // 설정이 그대로면 모델을 다시 부르지 않는다

    // 작성자가 편집기에서 칭찬을 '싫어함' 으로 고친다.
    const edited = { ...created.profile!, reactions: { compliment: { value: 'averse', by: 'author' } } }
    await updateCharacter(id, fields({ relationshipProfile: JSON.stringify(edited), relationshipProfileChanged: 'on' }))
    expect(parseRelationshipProfile((await row(id)).relationshipProfile)!.reactions.compliment).toEqual({ value: 'averse', by: 'author' })

    // 표를 고치지 않은 저장은 저장된 표를 건드리지 않는다(옛 화면이 뒤에서 만든 표를 덮지 않게).
    await updateCharacter(id, fields({ relationshipProfile: JSON.stringify({ ...edited, reactions: {} }) }))
    expect(parseRelationshipProfile((await row(id)).relationshipProfile)!.reactions.compliment?.value).toBe('averse')

    // 선택지 밖의 값은 들어오지 못한다.
    await updateCharacter(id, fields({ relationshipProfile: JSON.stringify({ ...edited, reactions: { lied: { value: 'averse', by: 'author' } } }), relationshipProfileChanged: 'on' }))
    expect(parseRelationshipProfile((await row(id)).relationshipProfile)!.reactions).toEqual({})
    await updateCharacter(id, fields({ relationshipProfile: JSON.stringify(edited), relationshipProfileChanged: 'on' }))

    // 성격 설명이 바뀌면 다시 만든다 — 작성자가 고친 칸은 남는다.
    const before = parseRelationshipProfile((await row(id)).relationshipProfile)!
    await updateCharacter(id, fields({ personality: '말수가 적고 아부를 싫어한다.' }))
    const after = profileStatus(await row(id))
    expect(after.status).toBe('ready')
    expect(after.profile!.sourceHash).not.toBe(before.sourceHash)
    expect(after.profile!.reactions.compliment).toEqual({ value: 'averse', by: 'author' })

    // 대화 턴이 읽는 캐릭터에 표가 실린다.
    const [session] = await db.select().from(roleplaySessions).where(eq(roleplaySessions.characterId, id))
    const loaded = await loadSession(session!.id, u!.id)
    expect(loaded!.snapshot.character.personality.relationshipProfile?.reactions.compliment?.value).toBe('averse')
  })
})
