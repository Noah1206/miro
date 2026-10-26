import { and, eq, isNull } from 'drizzle-orm'
import { characters, db, messages, officialVoices, roleplaySessions, userSettings } from '@miro/db'
import { spokenSegments } from '../voice-text'
import { SpeechError, type SpeechPolicy, type SpeechSpec } from './policy'
import { speechAllowance, speechCreditsEnabled, type SpeechAmount } from './credits-policy'
import { adultModeGateFor } from '../ops/safety'
import { feature } from '@miro/config'

export async function speechSource(userId: string, sessionId: string, messageId: string) {
  if(!feature('characterVoice'))throw new SpeechError('voice_not_ready',404)
  const [row] = await db.select({ role: messages.role, content: messages.content, blocks: messages.blocks, name: characters.name,
    voice: officialVoices.providerVoiceId, voiceStatus: officialVoices.status,characterId:characters.id,adultSince:roleplaySessions.adultSince })
    .from(messages)
    .innerJoin(roleplaySessions, and(eq(roleplaySessions.id,messages.sessionId),eq(roleplaySessions.userId,userId)))
    .innerJoin(characters,eq(characters.id,roleplaySessions.characterId))
    .leftJoin(officialVoices,eq(officialVoices.id,characters.voiceId))
    .where(and(eq(messages.id,messageId),eq(messages.sessionId,sessionId),isNull(messages.hiddenAt),isNull(roleplaySessions.deletedAt),
      isNull(roleplaySessions.restrictedAt),eq(roleplaySessions.status,'active'),isNull(characters.deletedAt))).limit(1)
  if (!row) throw new SpeechError('speech_not_found',404)
  if (row.role!=='character') throw new SpeechError('speech_forbidden',403)
  if(row.adultSince && !(await adultModeGateFor(userId,row.characterId,sessionId)).allowed)throw new SpeechError('speech_forbidden',403)
  return { row, segments: spokenSegments(row.blocks,row.content,row.name) }
}
export async function speechSpec(userId: string, sessionId: string, messageId: string, part: number, policy: SpeechPolicy, amount: SpeechAmount='standard'): Promise<SpeechSpec> {
  const {row,segments}=await speechSource(userId,sessionId,messageId)
  if (row.voiceStatus!=='active' || !row.voice) throw new SpeechError('voice_not_ready')
  const selected=part===-1?null:segments[part]
  const allowance=speechAllowance(amount)
  if(speechCreditsEnabled() && (part<0 || !row.blocks.some(b=>(b as Record<string,unknown>).type==='dialogue')
    || (selected?.text.length??0)>allowance.characters)) throw new SpeechError('speech_text_too_long',400)
  if (!segments.length || part < -1 || part>11 || part!==-1&&!selected) throw new SpeechError('invalid_voice_part',400)
  const delivery=selected?.delivery ?? (segments.length===1?segments[0]!.delivery:undefined)
  const [settings]=await db.select({language:userSettings.language}).from(userSettings).where(eq(userSettings.userId,userId)).limit(1)
  return { userId,sessionId,messageId,part,modelVersion:policy.modelVersion,referenceVersion:policy.referenceVersion,
    payload:{text:selected?.text ?? segments.map(s=>s.text).join(' '),voice:row.voice,language:settings?.language ?? 'ko',style:delivery?.tone==='whisper'?'whisper':'normal',delivery,
      ...(speechCreditsEnabled()?{maxAudioSeconds:allowance.seconds}:{})} }
}
