import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getOwnedCharacter } from '@/lib/owned'
import { Page, PageHeader } from '@/components/ui'
import { EditSections } from './sections'

export default async function EditCharacter({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { id } = await params
  const owned = await getOwnedCharacter(id, user.id)
  if (!owned) notFound()
  const c = owned.character
  return (
    <Page style={{ maxWidth: 560 }}>
      <PageHeader back="/archive" eyebrow="편집" title={c.name} lead="항목마다 따로 저장됩니다." />
      <EditSections characterId={id}
        character={{ name: c.name, age: c.age, nationality: c.nationality, occupation: c.occupation, mbti: c.mbti, personality: c.personality, values: c.values, speechStyle: c.speechStyle, jealousy: c.jealousy, initiative: c.initiative, emotionalExpression: c.emotionalExpression }}
        world={owned.world ? { era: owned.world.era ?? '', location: owned.world.location ?? '', genre: owned.world.genre ?? '', worldSetting: owned.world.worldSetting ?? '' } : null}
        appearance={{
          eyes: owned.visual?.baseFace?.eyes ?? '', nose: owned.visual?.baseFace?.nose ?? '',
          jaw: owned.visual?.baseFace?.jaw ?? '', skin: owned.visual?.baseFace?.skin ?? '',
          distinctive: owned.visual?.baseFace?.distinctive ?? '',
          hairColor: owned.visual?.hair?.color ?? '', hairLength: owned.visual?.hair?.length ?? '',
          hairStyle: owned.visual?.hair?.style ?? '',
          build: owned.visual?.bodyProfile?.build ?? 'average',
          height: owned.visual?.bodyProfile?.height ?? '', detail: owned.visual?.bodyProfile?.detail ?? '',
          expression: owned.visual?.expressionTendency ?? '',
        }}
        contact={owned.contact ? { contactFrequency: owned.contact.contactFrequency, replyDelayMinutes: owned.contact.replyDelayMinutes, callProbability: owned.contact.callProbability, videoCallProbability: owned.contact.videoCallProbability, photoProbability: owned.contact.photoProbability, voiceMessageProbability: owned.contact.voiceMessageProbability, activeHoursStart: owned.contact.activeHoursStart, activeHoursEnd: owned.contact.activeHoursEnd, initiativeLevel: owned.contact.initiativeLevel } : null} />
    </Page>
  )
}
