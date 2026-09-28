import type { FormInitial } from './character-form'
import { parseCharacterForm } from './parse'

export { activeDraftKey } from '@/lib/create-character-types'
export const draftStorageKey = (userId: string, type: 'chat' | 'reality', draftId: string) =>
  `miro:create:draft:${userId}:${type}:${draftId}`

/** Text settings are local until explicitly saved. File inputs cannot be serialized. */
export function serializableDraft(form: HTMLFormElement): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  new FormData(form).forEach((value, key) => { if (typeof value === 'string') entries.push([key, value]) })
  return entries
}

export function restoreDraft(entries: Array<[string, string]>, type: 'chat' | 'reality'): Partial<FormInitial> {
  const form = new FormData()
  for (const [key, value] of entries) form.append(key, value)
  form.set('experienceType', type)
  form.set('intent', 'draft')
  const name = String(form.get('name') ?? '')
  const personality = String(form.get('personality') ?? '')
  if (!name.trim()) form.set('name', '임시 이름')
  const p = parseCharacterForm(form, type)
  const c = p.character, r = p.initialRelationship, v = p.visual, contact = p.contact
  return {
    name, title: c.tagline ?? '', personality,
    age: c.age ?? '', mbti: c.mbti ?? '', nationality: c.nationality ?? '', occupation: c.occupation ?? '',
    hobbies: c.hobbies, dislikes: c.dislikes, mood: p.world.genre?.split(' · ') ?? [],
    jealousy: c.jealousy, initiative: c.initiative, emotionalExpression: c.emotionalExpression,
    relationshipKeywords: c.relationshipKeywords, startingContext: c.startingContext ?? '', startingTime: p.startingTime ?? '',
    worldSetting: p.world.worldSetting ?? '', worldLocation: p.world.location ?? '', sampleDialogue: c.sampleDialogue, lore: c.lore,
    stage: r.stage, trust: r.trust, attraction: r.attraction, relJealousy: r.jealousy,
    protectiveness: r.protectiveness, emotionalDistance: r.emotionalDistance, attachment: r.attachment,
    bonding: r.bonding ?? '',
    gender: v.bodyProfile.gender, build: v.bodyProfile.build, height: v.bodyProfile.height ?? '', detail: v.bodyProfile.detail ?? '',
    eyes: v.baseFace.eyes ?? '', nose: v.baseFace.nose ?? '', jaw: v.baseFace.jaw ?? '', skin: v.baseFace.skin ?? '', distinctive: v.baseFace.distinctive ?? '',
    hairColor: v.hair.color ?? '', hairLength: v.hair.length ?? '', hairStyle: v.hair.style ?? '', expression: v.expressionTendency ?? '', styleTags: v.styleTags,
    contactEnabled: contact.enabled, contactFrequency: contact.contactFrequency, initiativeLevel: contact.initiativeLevel,
    replyDelayMinutes: contact.replyDelayMinutes, activeHoursStart: contact.activeHoursStart, activeHoursEnd: contact.activeHoursEnd,
    preferredChannel: contact.preferredChannel, photoProbability: contact.photoProbability, voiceMessageProbability: contact.voiceMessageProbability,
    callProbability: contact.callProbability, videoCallProbability: contact.videoCallProbability, senderLabel: contact.presentation.senderLabel ?? '',
    isPublic: p.isPublicOn, images: [],
  }
}
