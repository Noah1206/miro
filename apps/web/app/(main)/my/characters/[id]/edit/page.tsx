import { features } from '@miro/config'
import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { getOwnedCharacter } from '@/lib/owned'
import { genreValues } from '@/lib/genres'
import { CharacterForm, type FormInitial } from '@/app/(main)/create/character-form'
import { updateCharacter } from './actions'

/** 편집 = 만들기와 같은 폼에 저장된 값을 채운 것. 항목·모양이 다르면 두 화면이 서로 거짓말을 한다. */
export default async function EditCharacter({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const { id } = await params
  const owned = await getOwnedCharacter(id, user.id)
  if (!owned) notFound()
  const { character: c, world, contact, visual } = owned
  const rel = c.initialRelationship as Record<string, number | string>
  const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback)

  const initial: Partial<FormInitial> = {
    experienceType: c.experienceType,
    name: c.name, title: c.tagline ?? '', worldSetting: world?.worldSetting ?? '',
    age: c.age ?? '', mbti: c.mbti ?? '', nationality: c.nationality ?? '', occupation: c.occupation ?? '',
    personality: c.personality, hobbies: c.hobbies, dislikes: c.dislikes,
    mood: genreValues(world?.genre ?? null),
    jealousy: c.jealousy, initiative: c.initiative, emotionalExpression: c.emotionalExpression,
    gender: visual?.bodyProfile?.gender ?? 'male', build: visual?.bodyProfile?.build ?? 'average',
    height: visual?.bodyProfile?.height ?? '', detail: visual?.bodyProfile?.detail ?? '',
    eyes: visual?.baseFace?.eyes ?? '', nose: visual?.baseFace?.nose ?? '', jaw: visual?.baseFace?.jaw ?? '',
    skin: visual?.baseFace?.skin ?? '', distinctive: visual?.baseFace?.distinctive ?? '',
    hairColor: visual?.hair?.color ?? '', hairLength: visual?.hair?.length ?? '', hairStyle: visual?.hair?.style ?? '',
    expression: visual?.expressionTendency ?? '', styleTags: visual?.styleTags ?? [],
    stage: typeof rel.stage === 'string' ? rel.stage : 'stranger',
    trust: num(rel.trust, 30), attraction: num(rel.attraction, 10), emotionalDistance: num(rel.emotionalDistance, 60),
    attachment: num(rel.attachment, 10), protectiveness: num(rel.protectiveness, 20), relJealousy: num(rel.jealousy, 0),
    bonding: typeof rel.bonding === 'string' ? rel.bonding : '',
    relationshipKeywords: c.relationshipKeywords,
    contactEnabled: contact?.enabled ?? true,
    contactFrequency: contact?.contactFrequency ?? 50, initiativeLevel: contact?.initiativeLevel ?? 50,
    replyDelayMinutes: contact?.replyDelayMinutes ?? 5,
    activeHoursStart: contact?.activeHoursStart ?? '08:00', activeHoursEnd: contact?.activeHoursEnd ?? '23:00',
    preferredChannel: contact?.preferredChannel ?? 'message',
    photoProbability: contact?.photoProbability ?? 20, voiceMessageProbability: contact?.voiceMessageProbability ?? 20,
    callProbability: contact?.callProbability ?? 30, videoCallProbability: contact?.videoCallProbability ?? 10,
    senderLabel: contact?.presentation?.senderLabel ?? '',
    startingContext: c.startingContext ?? '', startingTime: c.startingTime, sampleDialogue: c.sampleDialogue, lore: c.lore,
    isPublic: c.isPublic,
    images: c.images,
  }

  return (
    <CharacterForm mode="edit" capabilities={features()} draft={c.isDraft} initial={initial} action={updateCharacter.bind(null, id)}
      closeHref={c.isDraft ? '/my?filter=draft' : `/character/${id}`} />
  )
}
