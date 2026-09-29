import { randomUUID } from 'node:crypto'
import { features } from '@miro/config'
import { voiceOptions } from '@/lib/voice'
import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { db, characters } from '@miro/db'
import { and, eq, isNull } from 'drizzle-orm'
import { CharacterForm } from './character-form'
import { saveCharacter } from './actions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 앱은 미로 캐릭터만 만든다(2026-09-29 결정) — 유형 선택 없이 미로 캐릭터 편집기로 연다. 옛 type=chat 링크도 여기로 온다. */
export default async function CreatePage({ searchParams }: {
  searchParams: Promise<{ type?: string; draft?: string }>
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams])
  if (params.type !== 'reality') redirect('/create?type=reality')
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
