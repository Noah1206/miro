import { and, eq, isNull } from 'drizzle-orm'
import { characters, db, messages, officialVoices, roleplaySessions, userSettings } from '@miro/db'
import { resolveTts } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { speechQueueEnabled } from '@/lib/speech/policy'
import { submitSpeech, speechFailure, quoteSpeech } from '@/lib/speech/http'
import { speechAmount, speechCreditsEnabled } from '@/lib/speech/credits-policy'
import { spokenSegments } from '@/lib/voice-text'
import { feature } from '@miro/config'

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
  const body = await req.json().catch(() => null) as { sessionId?: unknown; messageId?: unknown; plan?: unknown; part?: unknown; quote?:unknown; amount?:unknown; confirmed?:unknown; reuseOnly?:unknown } | null
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '', messageId = typeof body?.messageId === 'string' ? body.messageId : ''
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(messageId)
    || (body?.plan !== undefined && typeof body.plan !== 'boolean')
    || (body?.reuseOnly !== undefined && typeof body.reuseOnly !== 'boolean')
    || (body?.part !== undefined && (!Number.isInteger(body.part) || Number(body.part) < 0 || Number(body.part) > 11))) return new Response(null, { status: 400 })
  const [row] = await db.select({ role: messages.role, content: messages.content, blocks: messages.blocks, name: characters.name,
    voice: officialVoices.providerVoiceId, voiceStatus: officialVoices.status })
    .from(messages)
    .innerJoin(roleplaySessions, and(eq(roleplaySessions.id, messages.sessionId), eq(roleplaySessions.userId, user.id)))
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .leftJoin(officialVoices, eq(officialVoices.id, characters.voiceId))
    .where(and(eq(messages.id, messageId), eq(messages.sessionId, sessionId), isNull(messages.hiddenAt),
      isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), eq(roleplaySessions.status, 'active'), isNull(characters.deletedAt))).limit(1)
  if (!row) return new Response(null, { status: 404 })
  if (row.role !== 'character') return new Response(null, { status: 403 })
  const segments = spokenSegments(row.blocks, row.content, row.name)
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
  const selected = body?.part === undefined ? null : segments[Number(body.part)]
  if (body?.part !== undefined && !selected) return new Response(null, { status: 400 })
  // Preserve the original whole-reply contract for older clients. New clients select each part.
  const text = selected ? (selected.speech ?? selected.text) : segments.map(s => s.speech ?? s.text).join(' ')
  const delivery = selected?.delivery ?? (segments.length === 1 ? segments[0]!.delivery : undefined)
  const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  try {
    const timeout = AbortSignal.timeout(170_000)
    const out = await tts.speak({ text, voice: row.voiceStatus === 'active' ? row.voice : null,
      language: settings?.language ?? 'ko', style: delivery?.tone === 'whisper' ? 'whisper' : 'normal', delivery },
      AbortSignal.any([req.signal, timeout]))
    return new Response(out.audio, { headers: { 'content-type': out.contentType, 'cache-control': 'private, no-store' } })
  } catch {
    // No automatic paid retry and no substitution with an unrelated browser voice.
    return Response.json({ error: 'voice_generation_failed' }, { status: 502 })
  }
}
