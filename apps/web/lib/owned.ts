import { and, eq, isNull } from 'drizzle-orm'
import { db, characters, worlds, contactProfiles } from '@miro/db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 사용자는 자신이 만든 캐릭터만 수정할 수 있다 (명세서 2.2 권한&접근). */
export async function getOwnedCharacter(characterId: string, userId: string) {
  // 잘못된 형식의 id 는 DB 까지 보내지 않는다 — uuid 캐스팅 실패는 500 을 만든다.
  if (!UUID.test(characterId)) return null

  const rows = await db
    .select({
      character: characters,
      world: worlds,
      contact: contactProfiles,
    })
    .from(characters)
    .leftJoin(worlds, eq(worlds.characterId, characters.id))
    .leftJoin(contactProfiles, eq(contactProfiles.characterId, characters.id))
    .where(and(
      eq(characters.id, characterId),
      eq(characters.ownerId, userId),
      isNull(characters.deletedAt),
    ))
    .limit(1)

  return rows[0] ?? null
}
