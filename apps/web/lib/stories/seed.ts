import { eq } from 'drizzle-orm'
import { db, stories, storyPrivate } from '@miro/db'
import { toPublic, validateDefinition, type StoryDefinition } from '@miro/domain'
import { hashOf } from './repo'

export type SeedReport = { slug: string; action: 'created' | 'updated' | 'unchanged' | 'skipped_edited' | 'invalid'; detail?: string }

/**
 * 작품을 DB 로 옮긴다. slug 로 찾아 갱신 — 몇 번 돌려도 한 줄. 공개 여부(is_published)는 건드리지 않는다(새 작품은 비공개).
 * DB 의 지금 내용이 시드가 마지막으로 쓴 해시와 다르면 사람이 고친 것 → force 가 아니면 건너뛴다.
 */
export async function seedStories(defs: StoryDefinition[], opts: { apply: boolean; force?: boolean }): Promise<SeedReport[]> {
  const out: SeedReport[] = []
  for (const [i, def] of defs.entries()) {
    const errs = validateDefinition(def)
    if (errs.length) { out.push({ slug: def.slug, action: 'invalid', detail: errs.join('; ') }); continue }
    const pub = toPublic(def)
    const pubHash = hashOf(pub), defHash = hashOf(def)
    const [row] = await db.select().from(stories).where(eq(stories.slug, def.slug)).limit(1)
    if (!row) {
      if (opts.apply) await db.transaction(async tx => {
        const [s] = await tx.insert(stories).values({ slug: def.slug, audience: def.audience, title: def.title, public: pub, sortOrder: i, seededHash: pubHash }).onConflictDoNothing().returning()
        if (s) await tx.insert(storyPrivate).values({ storyId: s.id, definition: def, seededHash: defHash })
      })
      out.push({ slug: def.slug, action: 'created' })
      continue
    }
    const [priv] = await db.select().from(storyPrivate).where(eq(storyPrivate.storyId, row.id)).limit(1)
    const pubEdited = row.seededHash !== null && hashOf(row.public) !== row.seededHash
    const defEdited = !!priv && priv.seededHash !== null && hashOf(priv.definition) !== priv.seededHash
    if ((pubEdited || defEdited) && !opts.force) { out.push({ slug: def.slug, action: 'skipped_edited', detail: [pubEdited && 'public', defEdited && 'definition'].filter(Boolean).join(',') }); continue }
    if (row.seededHash === pubHash && priv?.seededHash === defHash) { out.push({ slug: def.slug, action: 'unchanged' }); continue }
    if (opts.apply) await db.transaction(async tx => {
      await tx.update(stories).set({ audience: def.audience, title: def.title, public: pub, seededHash: pubHash, updatedAt: new Date() }).where(eq(stories.id, row.id))
      if (priv) await tx.update(storyPrivate).set({ definition: def, seededHash: defHash, updatedAt: new Date() }).where(eq(storyPrivate.storyId, row.id))
      else await tx.insert(storyPrivate).values({ storyId: row.id, definition: def, seededHash: defHash })
    })
    out.push({ slug: def.slug, action: 'updated' })
  }
  return out
}
