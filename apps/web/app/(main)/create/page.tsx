import { randomUUID } from 'node:crypto'
import { features } from '@miro/config'
import { voiceOptions } from '@/lib/voice'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { db, characters } from '@miro/db'
import { and, eq, isNull } from 'drizzle-orm'
import { CharacterForm } from './character-form'
import { saveCharacter } from './actions'
import { CreateTypePicker } from './type-picker'
import { CREATE_CHARACTER_OPTIONS } from '@/lib/create-character-types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** /create 는 유형을 고른다. 고를 게 하나뿐이면(첫 베타: 미로 캐릭터만) 바로 그 편집기로, 숨긴 유형 주소(type=chat)도 여기로 되돌린다(2026-09-30). */
export default async function CreatePage({ searchParams }: {
  searchParams: Promise<{ type?: string; draft?: string }>
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams])
  if (params.type === undefined) {
    if (params.draft !== undefined) notFound()
    if (CREATE_CHARACTER_OPTIONS.length === 1) redirect(`/create?type=${CREATE_CHARACTER_OPTIONS[0]!.type}`)
    const owned = await db.select({ id: characters.id, type: characters.experienceType, isDraft: characters.isDraft })
      .from(characters).where(and(eq(characters.ownerId, user.id), isNull(characters.deletedAt)))
    return <CreateTypePicker userId={user.id} saved={owned} />
  }
  if (params.type !== 'chat' && params.type !== 'reality') notFound()
  if (!CREATE_CHARACTER_OPTIONS.some(option => option.type === params.type)) redirect('/create')
  if (params.draft === undefined) redirect(`/create?type=${params.type}&draft=${randomUUID()}`)
  if (!UUID.test(params.draft)) notFound()
  const [existing] = await db.select({ type: characters.experienceType, isDraft: characters.isDraft })
    .from(characters).where(and(eq(characters.id, params.draft), eq(characters.ownerId, user.id), isNull(characters.deletedAt))).limit(1)
  if (existing) {
    if (existing.type !== params.type) notFound()
    redirect(existing.isDraft ? `/my/characters/${params.draft}/edit` : `/character/${params.draft}`)
  }

  return <CharacterForm key={`${user.id}:${params.type}:${params.draft}`} mode="create" experienceType={params.type} creationId={params.draft}
    userId={user.id} action={saveCharacter} closeHref="/home" capabilities={features()} voices={await voiceOptions()} />
}
