import { eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { db, characters, contactProfiles, worlds } from '@miro/db'

/**
 * 시드 캐릭터를 미로(reality) 캐릭터로 복제한다. 테스트 전용 — 운영 경로에서 부르지 않는다.
 *
 * 시드 공식 캐릭터는 전부 chat 이다. 기획대로 자동 편입하지 않으므로, Reality 를 검증하는
 * 테스트는 같은 성향·시작 관계·발신자 표시를 가진 reality 캐릭터를 따로 만든다. 시드 행의
 * 유형을 바꾸면 병렬로 도는 다른 테스트와 겹친다. 복제본은 공식도 공개도 아니라 어느 목록에도
 * 실리지 않고, 소유자를 주면 그 사용자만 상세·대화로 들어갈 수 있다.
 */
export async function cloneCharacterAsReality(slug: string, opts: { ownerId?: string } = {}) {
  const [src] = await db.select().from(characters).where(eq(characters.slug, slug)).limit(1)
  if (!src) throw new Error(`seed character missing: ${slug}`)
  const [world] = await db.select().from(worlds).where(eq(worlds.characterId, src.id)).limit(1)
  const [profile] = await db.select().from(contactProfiles).where(eq(contactProfiles.characterId, src.id)).limit(1)

  const { id: _id, slug: _slug, createdAt: _c, ...rest } = src
  const [c] = await db.insert(characters).values({
    ...rest, slug: `${slug}-reality-${randomBytes(3).toString('hex')}`,
    isOfficial: false, isPublic: false, experienceType: 'reality',
    ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
  }).returning({ id: characters.id })

  let worldId: string
  if (world) {
    const { id: _w, characterId: _wc, ...w } = world
    worldId = (await db.insert(worlds).values({ ...w, characterId: c!.id }).returning({ id: worlds.id }))[0]!.id
  } else {
    worldId = (await db.insert(worlds).values({ characterId: c!.id, location: '서울' }).returning({ id: worlds.id }))[0]!.id
  }
  if (profile) {
    const { id: _p, characterId: _pc, ...p } = profile
    await db.insert(contactProfiles).values({ ...p, characterId: c!.id })
  } else {
    await db.insert(contactProfiles).values({ characterId: c!.id })
  }
  return { id: c!.id, worldId, initial: src.initialRelationship }
}
