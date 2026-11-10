import { and, eq, isNull } from 'drizzle-orm'
import { characters, db, messages, officialVoices, roleplaySessions, userSettings } from '@miro/db'
import { matchSpeaker, spokenSegments, type SpokenSegment } from '../voice-text'
import { SpeechError, type SpeechPolicy, type SpeechSpec } from './policy'
import { speechAllowance, speechCreditsEnabled, type SpeechAmount } from './credits-policy'
import { adultModeGateFor } from '../ops/safety'
import { feature } from '@miro/config'
import { autoVoice, autoVoiceOfGender, listenerVoiceUsable, voiceColumns, voiceUsable } from '../voice'

export async function speechSource(userId: string, sessionId: string, messageId: string) {
  if(!feature('characterVoice'))throw new SpeechError('voice_not_ready',404)
  const [row] = await db.select({ role: messages.role, content: messages.content, blocks: messages.blocks, name: characters.name,
    voice: officialVoices.providerVoiceId, ...voiceColumns,characterId:characters.id,characterOwnerId:characters.ownerId,adultSince:roleplaySessions.adultSince,ensembleVoices:characters.ensembleVoices,
    voiceOverrides:roleplaySessions.voiceOverrides,audience:characters.audience,userId:roleplaySessions.userId })
    .from(messages)
    .innerJoin(roleplaySessions, and(eq(roleplaySessions.id,messages.sessionId),eq(roleplaySessions.userId,userId)))
    .innerJoin(characters,eq(characters.id,roleplaySessions.characterId))
    .leftJoin(officialVoices,eq(officialVoices.id,characters.voiceId))
    .where(and(eq(messages.id,messageId),eq(messages.sessionId,sessionId),isNull(messages.hiddenAt),isNull(roleplaySessions.deletedAt),
      isNull(roleplaySessions.restrictedAt),eq(roleplaySessions.status,'active'),isNull(characters.deletedAt))).limit(1)
  if (!row) throw new SpeechError('speech_not_found',404)
  if (row.role!=='character') throw new SpeechError('speech_forbidden',403)
  if(row.adultSince && !(await adultModeGateFor(userId,row.characterId,sessionId)).allowed)throw new SpeechError('speech_forbidden',403)
  return { row, segments: spokenSegments(row.blocks,row.content,row.name,Object.keys(row.ensembleVoices ?? {})) }
}
/**
 * 이 줄을 읽을 목소리 — 순서: ① 이 방에서 사용자가 고른 목소리(11/8, voice_overrides) ② 만든 사람이 정한 목소리
 * (히로인별 ensemble_voices, 없으면 카드 목소리, 11/4) ③ 자동 배정(11/8, lib/voice autoVoice — 화자마다 다른 목소리).
 * 같은 목소리를 여러 히로인이 같이 써도 된다. 쓸 수 없는 목소리(내려감·비공개·언베일 불가)는 건너뛴다.
 */
export async function segmentVoice(row: { voice: string | null; voiceStatus: string | null; voiceOwnerId: string | null; voiceShared: boolean | null; voiceAdultAllowed: boolean | null
  characterOwnerId: string | null; adultSince: Date | null; ensembleVoices: Record<string, string> | null
  voiceOverrides?: Record<string, string> | null; audience?: 'female' | 'male'; characterId?: string; userId?: string }, segment: SpokenSegment | undefined): Promise<string | null> {
  const names = Object.keys(row.ensembleVoices ?? {})
  const key = segment?.speaker ? matchSpeaker(segment.speaker, names) : null
  const adult = !!row.adultSince
  const lookup = async (id: string) => (await db.select({ voice: officialVoices.providerVoiceId, ...voiceColumns }).from(officialVoices).where(eq(officialVoices.id, id)).limit(1))[0]
  const picked = row.voiceOverrides?.[key ?? '']
  if (picked && row.userId) {
    const v = await lookup(picked)
    if (v && listenerVoiceUsable(v, row.userId, adult)) return v.voice
  }
  // 11/10: 목록에 없는 남자 인물(남성향 작품의 조연) — 카드 목소리(여자) 대신 남자 목소리, 이름마다 고정.
  if (!key && segment?.speaker && row.audience === 'male' && row.characterId) {
    const male = await autoVoiceOfGender('male', `${row.characterId}:${segment.speaker}`)
    const v = male ? await lookup(male) : undefined
    if (v && voiceUsable(v, row.characterOwnerId, adult)) return v.voice
  }
  const id = key ? row.ensembleVoices![key] : null
  if (id) {
    const v = await lookup(id)
    if (v && voiceUsable(v, row.characterOwnerId, adult)) return v.voice
  } else if (!key && row.voice && voiceUsable(row, row.characterOwnerId, adult)) return row.voice   // 11/9: 비워 둔 히로인('')은 카드 목소리 대신 자동 — 유저가 방에서 고른다
  if (!row.characterId || !row.audience) return null
  // 자리: 주인공 0, 히로인은 이름 순서대로 1, 2, … — 방 안에서 서로 다른 목소리
  const auto = await autoVoice(row.characterId, row.audience, key ? [...names].sort().indexOf(key) + 1 : 0)
  const v = auto ? await lookup(auto) : undefined
  return v && voiceUsable(v, row.characterOwnerId, adult) ? v.voice : null
}
export async function speechSpec(userId: string, sessionId: string, messageId: string, part: number, policy: SpeechPolicy, amount: SpeechAmount='standard'): Promise<SpeechSpec> {
  const {row,segments}=await speechSource(userId,sessionId,messageId)
  // 회원 목소리는 만든 사람이 공개·언베일 사용을 끄면 그때부터 읽지 않는다(lib/voice.ts)
  const selected=part===-1?null:segments[part]
  // 여러 인물 카드는 줄마다 화자 목소리(segmentVoice). 전체 읽기(part -1)는 첫 줄의 목소리.
  const voice=await segmentVoice(row,selected??segments[0])
  if (!voice) throw new SpeechError('voice_not_ready')
  const allowance=speechAllowance(amount)
  if(speechCreditsEnabled() && (part<0 || !row.blocks.some(b=>(b as Record<string,unknown>).type==='dialogue')
    || (selected?.text.length??0)>allowance.characters)) throw new SpeechError('speech_text_too_long',400)
  if (!segments.length || part < -1 || part>11 || part!==-1&&!selected) throw new SpeechError('invalid_voice_part',400)
  const delivery=selected?.delivery ?? (segments.length===1?segments[0]!.delivery:undefined)
  const [settings]=await db.select({language:userSettings.language}).from(userSettings).where(eq(userSettings.userId,userId)).limit(1)
  return { userId,sessionId,messageId,part,modelVersion:policy.modelVersion,referenceVersion:policy.referenceVersion,
    payload:{text:selected?(selected.speech??selected.text):segments.map(s=>s.speech??s.text).join(' '),voice,language:settings?.language ?? 'ko',style:delivery?.tone==='whisper'?'whisper':'normal',delivery,
      ...(speechCreditsEnabled()?{maxAudioSeconds:allowance.seconds}:{})} }
}
