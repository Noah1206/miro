import { and, eq, isNull } from 'drizzle-orm'
import { characters, db, messages, officialVoices, roleplaySessions, userSettings } from '@miro/db'
import { resolveTts } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { speechQueueEnabled } from '@/lib/speech/policy'
import { submitSpeech, speechFailure, quoteSpeech } from '@/lib/speech/http'
import { speechAmount, speechCreditsEnabled } from '@/lib/speech/credits-policy'
import { spokenSegments } from '@/lib/voice-text'
import { feature } from '@miro/config'
import { voiceColumns } from '@/lib/voice'
import { segmentVoice } from '@/lib/speech/access'
import { takeUserQuota, takeVoiceWake } from '@/lib/usage/user-quota'
import type { TtsProvider, TtsRequest } from '@miro/providers'

export const runtime = 'nodejs'
// The actual native model's cold load exceeded30s in the local comparison.
// Queue mode responds immediately; the180s bound is only for the legacy synchronous bridge.
export const maxDuration = 180

/** Only owner-authorized, committed character dialogue can trigger synthesis.
 * plan=true returns the utterance order without generating audio.
 * part selects a server-owned utterance, never client-supplied text or directions.
 */
export async function POST(req: Request) {
  if(!feature('characterVoice'))return Response.json({error:'voice_not_ready'},{status:404})
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null) as { sessionId?: unknown; messageId?: unknown; plan?: unknown; part?: unknown; quote?:unknown; amount?:unknown; confirmed?:unknown; reuseOnly?:unknown; wake?: unknown; stream?: unknown; turn?: unknown } | null
  // 11/6: 음성 모드를 켜면 서버를 미리 깨운다 — 대사를 누를 때 켜지는 시간(24~33초)을 기다리지 않게. 글·대화 없이 상태 확인만.
  // 11/10 깨우기는 회원당 5분에 한 번(GPU 를 계속 켜 두지 못하게).
  if (body?.wake === true) {
    if (!(await takeVoiceWake(user.id))) return Response.json({ error: 'voice_rate_limited' }, { status: 429 })
    await resolveTts()?.warm?.(AbortSignal.timeout(60_000)); return new Response(null, { status: 204 })
  }
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '', messageId = typeof body?.messageId === 'string' ? body.messageId : ''
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(messageId)
    || (body?.plan !== undefined && typeof body.plan !== 'boolean')
    || (body?.reuseOnly !== undefined && typeof body.reuseOnly !== 'boolean')
    || (body?.part !== undefined && (!Number.isInteger(body.part) || Number(body.part) < 0 || Number(body.part) > 11))) return new Response(null, { status: 400 })
  const [row] = await db.select({ role: messages.role, content: messages.content, blocks: messages.blocks, name: characters.name,
    voice: officialVoices.providerVoiceId, ...voiceColumns, characterOwnerId: characters.ownerId, adultSince: roleplaySessions.adultSince, ensembleVoices: characters.ensembleVoices,
    voiceOverrides: roleplaySessions.voiceOverrides, audience: characters.audience, characterId: characters.id, userId: roleplaySessions.userId })
    .from(messages)
    .innerJoin(roleplaySessions, and(eq(roleplaySessions.id, messages.sessionId), eq(roleplaySessions.userId, user.id)))
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .leftJoin(officialVoices, eq(officialVoices.id, characters.voiceId))
    .where(and(eq(messages.id, messageId), eq(messages.sessionId, sessionId), isNull(messages.hiddenAt),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), eq(roleplaySessions.status, 'active'), isNull(characters.deletedAt))).limit(1)
  if (!row) return new Response(null, { status: 404 })
  if (row.role !== 'character') return new Response(null, { status: 403 })
  const segments = spokenSegments(row.blocks, row.content, row.name, Object.keys(row.ensembleVoices ?? {}))
  if (!segments.length) return new Response(null, { status: 204 })
  if(speechCreditsEnabled() && !speechQueueEnabled()) return Response.json({error:'voice_not_ready'},{status:503})
  const tts = resolveTts()
  if (!tts) return Response.json({ error: 'voice_unavailable' }, { status: 503 })
  if (body?.plan) return Response.json({ segments: segments.map((s, part) => ({ part, pauseAfterMs: s.delivery.pauseAfterMs })) },
    { headers: { 'cache-control': 'private, no-store' } })
  if (speechQueueEnabled()) {
    try {
      const amount=speechAmount(body?.amount)
      if(body?.quote===true)return await quoteSpeech(user.id,sessionId,messageId,Number(body.part),amount)
      if(speechCreditsEnabled() && body?.confirmed!==true)return Response.json({error:'speech_confirmation_required'},{status:409})
      return await submitSpeech(user.id,sessionId,messageId,body?.part === undefined ? -1 : Number(body.part),amount,body?.reuseOnly===true)
    }
    catch(error) { return speechFailure(error) }
  }
  // 11/10 동기 합성(운영 기본 경로)은 회원당 분당 30회·하루 600회.
  if (!(await takeUserQuota(user.id, 'voice_speak', [{ ms: 60_000, max: 30 }, { ms: 86_400_000, max: 600 }]))) return Response.json({ error: 'voice_rate_limited' }, { status: 429 })
  // 11/11 한 턴 통째(사용자: 묶음이 아니라 1턴당 바로) — 대화 순서의 묶음과 각 목소리를 넘기면 서버가 목소리마다 한 번에 합성해 잘라 순서대로 흘려보낸다.
  // 감정·말투는 같은 사람이면 그 턴의 첫 묶음 것 하나.
  if (body?.turn === true && tts.speakTurn) {
    const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
    const first = new Map<string, (typeof segments)[number]['delivery']>()
    const lines = await Promise.all(segments.map(async s => {
      const key = s.speaker ?? ''
      if (!first.has(key)) first.set(key, s.delivery)
      return { text: s.speech ?? s.text, voice: await segmentVoice(row, s), delivery: first.get(key)! }
    }))
    if (lines.some(l => !l.voice)) return Response.json({ error: 'voice_unavailable' }, { status: 503 })
    try {
      const out = await tts.speakTurn({ lines, language: settings?.language ?? 'ko' }, AbortSignal.any([req.signal, AbortSignal.timeout(170_000)]))
      return new Response(out.stream, { headers: { 'content-type': 'audio/L16', 'x-sample-rate': String(out.sampleRate), 'cache-control': 'private, no-store', 'x-accel-buffering': 'no' } })
    } catch { return Response.json({ error: 'voice_generation_failed' }, { status: 502 }) }
  }
  const selected = body?.part === undefined ? null : segments[Number(body.part)]
  if (body?.part !== undefined && !selected) return new Response(null, { status: 400 })
  // Preserve the original whole-reply contract for older clients. New clients select each part.
  const text = selected ? (selected.speech ?? selected.text) : segments.map(s => s.speech ?? s.text).join(' ')
  const delivery = selected?.delivery ?? (segments.length === 1 ? segments[0]!.delivery : undefined)
  const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  return synthesize(tts, { text, voice: await segmentVoice(row, selected ?? segments[0]),
    language: settings?.language ?? 'ko', style: delivery?.tone === 'whisper' ? 'whisper' : 'normal', delivery }, req, body?.stream === true)
}

/**
 * 11/11 stream=true 면 만드는 대로 PCM16 조각을 그대로 흘려보낸다(audio/L16, x-sample-rate) — 첫소리가 대사 전체 합성을 기다리지 않는다.
 * 스트리밍을 못 하는 합성 서버면 예전처럼 WAV 하나.
 */
async function synthesize(tts: TtsProvider, request: TtsRequest, req: Request, stream: boolean): Promise<Response> {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(170_000)])
    if (stream && tts.speakStream) {
      const out = await tts.speakStream(request, signal)
      return new Response(out.stream, { headers: { 'content-type': 'audio/L16', 'x-sample-rate': String(out.sampleRate), 'cache-control': 'private, no-store', 'x-accel-buffering': 'no' } })
    }
    const out = await tts.speak(request, signal)
    return new Response(out.audio, { headers: { 'content-type': out.contentType, 'cache-control': 'private, no-store' } })
  } catch {
    // No automatic paid retry and no substitution with an unrelated browser voice.
    return Response.json({ error: 'voice_generation_failed' }, { status: 502 })
  }
}
