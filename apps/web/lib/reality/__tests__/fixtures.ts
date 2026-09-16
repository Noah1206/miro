import { inArray } from 'drizzle-orm'
import { db, characters } from '@miro/db'
import { cloneCharacterAsReality } from '@/lib/dev/reality-clone'

/** 시드 캐릭터의 reality 복제본. 구현은 lib/dev/reality-clone.ts — E2E 의 dev 라우트와 같다. */
const cloned: string[] = []

export async function cloneAsReality(slug: string, opts: { ownerId?: string } = {}) {
  const c = await cloneCharacterAsReality(slug, opts)
  cloned.push(c.id)
  return c
}

/** afterAll 에서 부른다. 세션·연락은 캐릭터를 따라 지워진다. */
export async function dropRealityClones(): Promise<void> {
  if (cloned.length) await db.delete(characters).where(inArray(characters.id, cloned.splice(0)))
}
