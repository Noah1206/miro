import { randomUUID } from 'node:crypto'
import { features } from '@miro/config'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { db, characters } from '@miro/db'
import { and, eq, isNull } from 'drizzle-orm'
import { CharacterForm } from './character-form'
import { saveCharacter } from './actions'
import { CreateTypePicker } from './type-picker'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** The existing /create entry now chooses an experience. Typed links open the shared editor. */
export default async function CreatePage({ searchParams }: {
  searchParams: Promise<{ type?: string; draft?: string }>
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams])
  if (params.type === undefined) {
    if (params.draft !== undefined) notFound()
    const owned = await db.select({ id: characters.id, type: characters.experienceType, isDraft: characters.isDraft })
      .from(characters).where(and(eq(characters.ownerId, user.id), isNull(characters.deletedAt)))
    return <CreateTypePicker userId={user.id} saved={owned} />
  }
  if (params.type !== 'chat' && params.type !== 'reality') notFound()
  if (params.draft === undefined) redirect(`/create?type=${params.type}&draft=${randomUUID()}`)
  if (!UUID.test(params.draft)) notFound()
  const [existing] = await db.select({ type: characters.experienceType, isDraft: characters.isDraft })
    .from(characters).where(and(eq(characters.id, params.draft), eq(characters.ownerId, user.id), isNull(characters.deletedAt))).limit(1)
  if (existing) {
    if (existing.type !== params.type) notFound()
    redirect(existing.isDraft ? `/my/characters/${params.draft}/edit` : `/character/${params.draft}`)
  }

  return <CharacterForm key={`${user.id}:${params.type}:${params.draft}`} mode="create" experienceType={params.type} creationId={params.draft}
    userId={user.id} action={saveCharacter} closeHref="/create" capabilities={features()} />
}
