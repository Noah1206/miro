import { createHash, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db, users, characters, officialVoices } from '@miro/db'
import { saveCharacter } from '@/app/(main)/create/actions'
import { updateCharacter } from '@/app/(main)/my/characters/[id]/edit/actions'
import { selectableVoice, voiceOptions } from '../voice'

const auth = vi.hoisted(() => ({ userId: '' }))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: auth.userId }) }))
vi.mock('@/lib/storage/images', () => ({ resolveCharacterImages: async () => [] }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) }, notFound: () => { throw new Error('NOT_FOUND') } }))

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const tag = randomUUID().slice(0, 8)
const active = `it-on-${tag}`, retired = `it-off-${tag}`
const users_: string[] = []
afterAll(async () => {
  if (!process.env.DATABASE_URL) return
  for (const id of users_) { await db.delete(characters).where(eq(characters.ownerId, id)); await db.delete(users).where(eq(users.id, id)) }
  await db.delete(officialVoices).where(inArray(officialVoices.id, [active, retired]))
})

async function creator(voiceId: string) {
  const [u] = await db.insert(users).values({ email: `voice-${randomUUID()}@example.test` }).returning()
  auth.userId = u!.id; users_.push(u!.id)
  const fd = new FormData()
  for (const [k, v] of Object.entries({ name: '목소리 테스트', title: 'hi', personality: 'calm', startingContext: 'at home', voiceId })) fd.set(k, v)
  await expect(saveCharacter(fd)).rejects.toThrow('REDIRECT:/chat/')
  const [c] = await db.select().from(characters).where(eq(characters.ownerId, u!.id))
  return { c: c!, userId: u!.id, fd }
}

describeDb('official voices in Miro', () => {
  it('lists only active voices, and creators can only save a voice that is active right now', async () => {
    const record = { provider: 'chatterbox' as const, samples: [], rights: { basis: 'own_voice' }, approval: { decision: 'approved' } }
    const artifact = (seed: string) => createHash('sha256').update(seed).digest('hex')
    await db.insert(officialVoices).values([
      { id: active, label: '맑은 소년', providerVoiceId: artifact(active), status: 'active', ...record },
      { id: retired, label: '내린 목소리', providerVoiceId: artifact(retired), status: 'retired', retiredAt: new Date(), ...record },
    ])
    const options = await voiceOptions()
    expect(options).toContainEqual({ id: active, label: '맑은 소년' })
    expect(options.map(o => o.id)).not.toContain(retired)
    // 화면에는 이름만 간다 — 엔진 쪽 목소리 ID 는 싣지 않는다.
    expect(Object.keys(options[0]!).sort()).toEqual(['id', 'label'])
    expect(await selectableVoice(retired)).toBeNull()
    expect(await selectableVoice('nope')).toBeNull()

    const { c, fd } = await creator(active)
    expect(c.voiceId).toBe(active)
    fd.set('voiceId', retired)
    await expect(updateCharacter(c.id, fd)).rejects.toThrow('REDIRECT:')
    expect((await db.select().from(characters).where(eq(characters.id, c.id)))[0]!.voiceId).toBeNull()
    expect((await creator('made-up')).c.voiceId).toBeNull()
  })
})
