import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db, users, characters, worlds } from '@miro/db'
import { updateCharacter } from '@/app/(main)/my/characters/[id]/edit/actions'
import { getOwnedCharacter } from '../owned'
import { testDatabaseUrl } from '../../../../tooling/test-database'

const mocks = vi.hoisted(() => ({ userId: '', revalidate: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: mocks.userId }) }))
vi.mock('@/lib/storage/images', () => ({ resolveCharacterImages: async () => [] }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))

const describeDb = testDatabaseUrl(process.env.DATABASE_URL) ? describe : describe.skip
const made: string[] = []
afterEach(() => mocks.revalidate.mockClear())
afterAll(async () => {
  for (const id of made) {
    await db.delete(characters).where(eq(characters.ownerId, id))
    await db.delete(users).where(eq(users.id, id))
  }
})
async function makeUser() {
  const [row] = await db.insert(users).values({ email: `profile-draft-${randomUUID()}@example.test` }).returning({ id: users.id })
  made.push(row!.id)
  return row!.id
}
function draftFields(name: string) {
  const form = new FormData()
  for (const [key, value] of Object.entries({ intent: 'draft', experienceType: 'chat', name, personality: '차분하고 솔직한 사람', worldSetting: '도시의 작은 서점' })) form.set(key, value)
  return form
}

describeDb('profile character management', () => {
  it('persists draft edits, returns to the draft list and invalidates the actual management route', async () => {
    mocks.userId = await makeUser()
    const [character] = await db.insert(characters).values({ ownerId: mocks.userId, name: '이전 이름', personality: '차분한 사람', experienceType: 'chat', isDraft: true, isPublic: false }).returning({ id: characters.id })
    await db.insert(worlds).values({ characterId: character!.id, worldSetting: '이전 설정' })

    expect(await updateCharacter(character!.id, draftFields('수정한 이름'))).toBe('/my/characters?filter=draft')
    const saved = await getOwnedCharacter(character!.id, mocks.userId)
    expect(saved!.character).toMatchObject({ name: '수정한 이름', isDraft: true, isPublic: false })
    expect(saved!.world!.worldSetting).toBe('도시의 작은 서점')
    expect(mocks.revalidate).toHaveBeenCalledWith('/my/characters')
  })
  it('refuses another user’s character without changing its saved values', async () => {
    const owner = await makeUser()
    const [character] = await db.insert(characters).values({ ownerId: owner, name: '소유자 캐릭터', personality: '차분한 사람', experienceType: 'chat', isDraft: true }).returning({ id: characters.id })
    mocks.userId = await makeUser()
    expect(await getOwnedCharacter(character!.id, mocks.userId)).toBeNull()
    await expect(updateCharacter(character!.id, draftFields('다른 사용자 수정'))).rejects.toThrow('NOT_FOUND')
    expect((await getOwnedCharacter(character!.id, owner))!.character.name).toBe('소유자 캐릭터')
  })
})
