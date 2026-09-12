import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentUser } from '@/lib/auth'
import { getOwnedCharacter } from '@/lib/owned'
import { EditSections } from './sections'

/** 고급 편집. 폼 전체를 한 화면에 늘어놓지 않고 섹션 단위로 저장한다. */
export default async function EditCharacter({
  params,
}: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  const { id } = await params
  const owned = await getOwnedCharacter(id, user.id)
  if (!owned) notFound()

  return (
    <main style={{ minHeight: '100dvh', padding: '24px 24px 80px', maxWidth: 560, margin: '0 auto' }}>
      <Link href="/home" style={{ fontSize: 20, color: 'var(--text-secondary)' }}>‹</Link>
      <h1 style={{ fontSize: 22, margin: '18px 0 4px' }}>{owned.character.name}</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px' }}>
        각 항목은 따로 저장됩니다.
      </p>

      <EditSections
        characterId={id}
        character={{
          name: owned.character.name,
          age: owned.character.age,
          nationality: owned.character.nationality,
          occupation: owned.character.occupation,
          mbti: owned.character.mbti,
          personality: owned.character.personality,
          values: owned.character.values,
          speechStyle: owned.character.speechStyle,
          jealousy: owned.character.jealousy,
          initiative: owned.character.initiative,
          emotionalExpression: owned.character.emotionalExpression,
        }}
        world={owned.world ? {
          era: owned.world.era ?? '',
          location: owned.world.location ?? '',
          genre: owned.world.genre ?? '',
          worldSetting: owned.world.worldSetting ?? '',
        } : null}
        contact={owned.contact ? {
          contactFrequency: owned.contact.contactFrequency,
          replyDelayMinutes: owned.contact.replyDelayMinutes,
          callProbability: owned.contact.callProbability,
          videoCallProbability: owned.contact.videoCallProbability,
          photoProbability: owned.contact.photoProbability,
          voiceMessageProbability: owned.contact.voiceMessageProbability,
          activeHoursStart: owned.contact.activeHoursStart,
          activeHoursEnd: owned.contact.activeHoursEnd,
          initiativeLevel: owned.contact.initiativeLevel,
        } : null}
      />
    </main>
  )
}
