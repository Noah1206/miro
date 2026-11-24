import { and, desc, eq, isNull } from 'drizzle-orm'
import { after } from 'next/server'
import { characters, db, messages, officialVoices, roleplaySessions, userSettings } from '@miro/db'
import { resolveTts } from '@miro/providers'
import { currentUser } from '@/lib/auth'
import { speechQueueEnabled } from '@/lib/speech/policy'
import { submitSpeech, speechFailure, quoteSpeech } from '@/lib/speech/http'
import { speechAmount, speechCreditsEnabled } from '@/lib/speech/credits-policy'
import { spokenSegments, type SpokenSegment } from '@/lib/voice-text'
import { feature } from '@miro/config'
import { voiceColumns } from '@/lib/voice'
import { segmentVoice, speechSource } from '@/lib/speech/access'
import { takeUserQuota, takeVoiceWake } from '@/lib/usage/user-quota'
import type { TtsProvider, TtsRequest } from '@miro/providers'
import { accrueVoiceReward } from '@/lib/usage/creator-reward'
import { liveTurn } from '@/lib/simulation/live-turns'
import { adultModeGateFor } from '@/lib/ops/safety'
import { observe } from '@/lib/observe'

export const runtime = 'nodejs'
// The actual native model's cold load exceeded30s in the local comparison.
// Queue mode responds immediately; the180s bound is only for the legacy synchronous bridge.
// 11/17 180 → 600: 한 턴 통째 합성은 소리 길이의 약 2/3 시간이 걸린다(실측 221초 소리에 148초) — 읽을 글 2,000자(약 5분 소리)에 서버가 켜지는 시간까지 들어가야 한다.
export const maxDuration = 600

/**
 * 11/19 사용자: 대기 시간은 줄이지 않고, 아무도 안 들을 때만 빨리 끈다.
 * 음성 모드가 켜진 채팅방(화면이 보이는 동안)이 1분마다 beat 를 보낸다. 신호가 오는 동안은 예전처럼 켜 두고(Modal 대기 20분 + 10분마다 다시 깨움),
 * 방을 나가거나 음성을 끄거나 화면을 닫아 신호가 3분 끊기면 Modal 대기를 1분으로 낮춰 서버가 스스로 꺼지게 한다
 * (update_autoscaler — 강제로 끄는 게 아니라서 꺼진 서버를 괜히 켤 일이 없다). 다시 쓰면 대기를 20분으로 되돌린다.
 * 홈에서 깨운 것(방 없이)은 예전처럼 30분 켜 두되, 그 뒤 방에서 쓰기 시작하면 방 기준으로 바뀐다. 마지막 실제 사용(깨우기·합성)에서 30분이 상한.
 * ponytail: 이 웹 서버 프로세스 안 숫자(맥 한 대) — 웹 서버가 다시 뜨면 상태가 비어 1분 안에 대기를 낮춘다(다음 요청이 되돌린다).
 */
const MIN = 60_000
const voice = { lastUse: 0, lastBeat: 0, lastWarm: 0, homeUntil: 0, released: false }
// 11/24 사용자(Modal 비용): 마지막 실제 사용(깨우기·합성) 뒤 켜 두는 상한을 30분 → 10분 — 음성을 켠 채 화면만 띄워 둔 방이 30분씩 GPU 를 잡았다.
// 다시 쓰려고 글을 쓰기 시작하면 화면이 깨운다(immersive.tsx wake).
const keepVoiceUntil = () => Math.min(Math.max(voice.lastBeat + 3 * MIN, voice.lastUse + 3 * MIN, voice.homeUntil), voice.lastUse + 10 * MIN)
function holdVoice(active: boolean) {
  const url = process.env.MIRO_VOICE_UPLOAD_URL?.replace(/\/$/, ''), key = process.env.MIRO_TTS_API_KEY
  if (!url) return
  void fetch(`${url}/hold?active=${active ? 1 : 0}`, { method: 'POST', headers: key ? { authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(30_000) })
    .then(r => { if (r.ok) voice.released = !active }).catch(() => {})
}
/** 깨우기·합성 요청 — home: 방 없이 홈에서 깨운 것. */
function voiceUsed(home = false) {
  const now = Date.now()
  voice.lastUse = voice.lastWarm = now
  voice.homeUntil = home ? now + 3 * MIN : 0   // 11/24 방 없이 깨운 것도 3분만(홈 깨우기는 없앴다)
  if (voice.released) holdVoice(true)
}
const g = globalThis as { miroVoiceTimer?: ReturnType<typeof setInterval> }
g.miroVoiceTimer ??= setInterval(() => {
  const now = Date.now()
  if (now > keepVoiceUntil()) { if (!voice.released) holdVoice(false); return }
  // Modal 대기 상한이 20분이라, 듣는 방이 있는 동안 10분마다 한 번 깨워 꺼지지 않게.
  if (now - voice.lastWarm > 10 * MIN) { voice.lastWarm = now; void resolveTts()?.warm?.(AbortSignal.timeout(60_000))?.catch(() => {}) }
}, MIN)
g.miroVoiceTimer.unref?.()

/** Only owner-authorized, committed character dialogue can trigger synthesis.
 * plan=true returns the utterance order without generating audio.
 * part selects a server-owned utterance, never client-supplied text or directions.
 */
/**
 * 11/18 음성 서버는 GPU 1대가 한 번에 하나씩 만든다 — 동시에 몰리면 줄을 길게 세우지 않고 바로 'voice_busy'(503)로 돌려준다.
 * 화면은 기다리지 않고 글을 바로 보여 준다(immersive.tsx). 스트림이 끝나거나 끊길 때 자리를 돌려준다. ponytail: 서버 한 대(맥) 프로세스 안 숫자.
 */
const VOICE_MAX_INFLIGHT = Number(process.env.MIRO_VOICE_MAX_INFLIGHT ?? 3)
let voiceInflight = 0
/** 11/23 방마다 답이 만들어지는 동안 이미 읽은 줄(early) — 저장 뒤 turn 요청이 그 줄들을 빼고 읽는다. live = 그 턴(새 턴이면 처음부터). ponytail: 맥 한 대 프로세스 메모리. */
// 11/24 turn = 이 답을 나눠 읽는 요청들이 음성 서버에 함께 쓰는 턴 이름 — 요청마다 다른 이름을 주면 서버가 앞 요청의 소리를 '지난 턴'으로 기억에 넣어
// 다음 요청마다 준비(읽어 둔 상태)를 처음부터 다시 했다(첫 줄 뒤 16초·남은 대사 앞 22초 공백).
const earlySpoken = new Map<string, { live: object; texts: string[]; voices: Set<string>; at: number; turn: string }>()
const spokenKey = (x: string) => x.replace(/[\s…·.,!?~"']/g, '')
/** 묶음 목록에서 앞의 줄 k 개(이미 읽은 줄)를 뺀 나머지 — 묶음 중간에서 끊기면 남은 줄만으로 그 묶음을 다시 만든다. */
function dropSpoken(segments: SpokenSegment[], k: number): SpokenSegment[] {
  const out: SpokenSegment[] = []
  for (const s of segments) {
    if (k >= s.parts.length) { k -= s.parts.length; continue }
    if (k > 0) { const parts = s.parts.slice(k); out.push({ ...s, speech: undefined, text: parts.map(p => p.text).join(' '), lines: s.lines.slice(k), parts }); k = 0 }
    else out.push(s)
  }
  return out
}
const voiceBusy = () => Response.json({ error: 'voice_busy' }, { status: 503 })
function takeVoiceSlot(): (() => void) | null {
  if (voiceInflight >= VOICE_MAX_INFLIGHT) return null
  voiceInflight++
  let done = false
  return () => { if (!done) { done = true; voiceInflight-- } }
}
function releasing(stream: ReadableStream<Uint8Array>, release: () => void, gone?: AbortSignal): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      try { const { done, value } = await reader.read(); if (done) { release(); c.close() } else c.enqueue(value) }
      // 11/24 듣는 사람이 방을 나가거나 새로고침하면(요청 취소) 합성 서버 쪽 읽기가 끊기는데, 그걸 오류로 넘겨 '서버 오류 failed to pipe response' 운영 알림이 울렸다 —
      // 요청이 취소된 경우는 조용히 닫는다. 합성 서버가 도중에 끊긴 진짜 실패만 오류로 남긴다.
      catch (e) { release(); if (gone?.aborted) { try { c.close() } catch { /* 이미 닫힘 */ } } else c.error(e) }
    },
    cancel(reason) { release(); return reader.cancel(reason) },
  })
}

// 11/23 사용자 "토글을 켰는데도 음성이 안 나왔다" — 요청마다 결과(상태·종류·시간)를 남겨 어디서 멈췄는지 기록으로 가른다(글·목소리 값은 남기지 않음).
export async function POST(req: Request) {
  const started = Date.now()
  const b = await req.clone().json().catch(() => null) as Record<string, unknown> | null
  const kind = b?.played ? 'played' : b?.beat ? 'beat' : b?.wake ? 'wake' : b?.early ? 'early' : b?.turn ? 'turn' : b?.part !== undefined ? 'part' : 'other'
  const res = await handle(req)
  // played(11/24): 기기에서 소리가 재생 줄에 올라갔다는 알림 — of = 어떤 요청의 소리(early·turn·part), audio = 소리판 상태(running 이면 실제로 나는 상태, suspended 면 잠겨 무음).
  if (kind === 'played') observe('tts.played', { sessionId: typeof b?.sessionId === 'string' ? b.sessionId : null, of: typeof b?.of === 'string' ? b.of.slice(0, 10) : null, audio: typeof b?.audio === 'string' ? b.audio.slice(0, 12) : null })
  else if (kind !== 'beat') observe('tts.request', { kind, status: res.status, ms: Date.now() - started, sessionId: typeof b?.sessionId === 'string' ? b.sessionId : null, inflight: voiceInflight })
  return res
}
async function handle(req: Request) {
  if(!feature('characterVoice'))return Response.json({error:'voice_not_ready'},{status:404})
  const user = await currentUser()
  if (!user) return new Response(null, { status: 401 })
  const body = await req.json().catch(() => null) as { sessionId?: unknown; messageId?: unknown; plan?: unknown; part?: unknown; quote?:unknown; amount?:unknown; confirmed?:unknown; reuseOnly?:unknown; wake?: unknown; beat?: unknown; stream?: unknown; turn?: unknown; oral?: unknown; early?: unknown } | null
  if ((body as { played?: unknown } | null)?.played === true) return new Response(null, { status: 204 })   // 11/24 재생 시작 알림 — 기록만(위 POST 가 남긴다)
  // 11/19 음성 모드가 켜진 방이 보이는 동안 1분마다 — '아직 듣고 있다'는 신호(서버를 깨우지 않는다, 대기 판단만).
  if (body?.beat === true) {
    voice.lastBeat = Date.now()
    if (voice.released && Date.now() < voice.lastUse + 30 * MIN) holdVoice(true)
    return new Response(null, { status: 204 })
  }
  // 11/6: 음성 모드를 켜면 서버를 미리 깨운다 — 대사를 누를 때 켜지는 시간(24~33초)을 기다리지 않게. 글·대화 없이 상태 확인만.
  // 11/10 깨우기는 회원당 5분에 한 번(GPU 를 계속 켜 두지 못하게).
  if (body?.wake === true) {
    if (!(await takeVoiceWake(user.id))) return Response.json({ error: 'voice_rate_limited' }, { status: 429 })
    // 11/12 방을 함께 주면 그 방의 목소리 기억도 미리 불러온다(본인 방인지는 따로 보지 않는다 — 기억을 읽어 둘 뿐 아무것도 돌려주지 않는다).
    const room = typeof body.sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(body.sessionId) ? body.sessionId : undefined
    voiceUsed(!room)
    const known = await resolveTts()?.warm?.(AbortSignal.timeout(60_000), room)
    // 11/16 사용자: 처음부터 이어 말하는 목소리 — 이 방의 목소리 기억이 비어 있으면 지난 답 두 개를 뒤에서 미리 읽혀 기억을 만든다(소리는 버린다).
    if (room && known === 0) after(() => primeRoomVoice(user.id, room))
    return new Response(null, { status: 204 })
  }
  // 11/23 사용자 "답마다 음성이 늦게 나와": 답 전체(20~70초)를 기다리지 않고, 만들어지는 중인 답의 첫 대사 줄이 완성되면 그 줄부터 읽는다.
  // 글은 클라이언트가 아니라 서버 메모리의 진행 중 턴(live-turns)에서 꺼낸다 — 저장된 답과 같은 원칙(사용자가 보낸 글은 읽지 않는다).
  // 저장 뒤 한 턴 통째(turn) 요청은 이미 읽은 첫 줄을 빼고 읽는다(earlySpoken). 음성 분량 차감이 켜진 운영에선 쓰지 않는다.
  if (body?.early === true) {
    const sid = typeof body.sessionId === 'string' && /^[0-9a-f-]{36}$/i.test(body.sessionId) ? body.sessionId : ''
    const live = sid ? liveTurn(sid, user.id, 'chat') : null
    if (!live || speechCreditsEnabled()) return new Response(null, { status: 204 })
    const [row] = await db.select({ name: characters.name, voice: officialVoices.providerVoiceId, ...voiceColumns, characterOwnerId: characters.ownerId, adultSince: roleplaySessions.adultSince,
      ensembleVoices: characters.ensembleVoices, voiceOverrides: roleplaySessions.voiceOverrides, audience: characters.audience, characterId: characters.id, userId: roleplaySessions.userId })
      .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId)).leftJoin(officialVoices, eq(officialVoices.id, characters.voiceId))
      .where(and(eq(roleplaySessions.id, sid), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), isNull(roleplaySessions.restrictedAt), eq(roleplaySessions.status, 'active'), isNull(characters.deletedAt))).limit(1)
    if (!row || (row.adultSince && !(await adultModeGateFor(user.id, row.characterId, sid)).allowed)) return new Response(null, { status: 204 })
    // 11/23 사용자 "음성 모드일 때 너무 오래 걸려(30~40초)": 첫 줄만 미리 읽고 나머지는 답이 다 저장된 뒤(40~60초)에야 읽어 그 사이가 침묵이었다 —
    // 답이 만들어지는 동안 완성된 대사·속마음을 부를 때마다 이어서 읽는다(화면이 앞 소리를 받는 대로 다음을 부른다). 쓰는 중인 블록(partial)은 뺀다.
    const prior = earlySpoken.get(sid)
    const state = prior?.live === live ? prior : { live, texts: [] as string[], voices: new Set<string>(), at: 0, turn: `early-${crypto.randomUUID()}` }
    const segs = spokenSegments(live.blocks.filter(b => b.partial !== true), '', row.name, Object.keys(row.ensembleVoices ?? {})), flat = segs.flatMap(seg => seg.parts)
    // 답을 처음부터 다시 쓰는 경우(형식 오류 재시도 → 블록이 비워짐)에는 읽은 줄이 지금 글의 앞부분과 달라진다 — 같은 데까지만 읽은 것으로 친다.
    let same = 0
    while (same < state.texts.length && same < flat.length && spokenKey(flat[same]!.text) === state.texts[same]) same++
    if (same < flat.length) state.texts.length = same
    const rest = dropSpoken(segs, state.texts.length)
    const tts = resolveTts()
    if (!rest.length || !tts?.speakTurn) return new Response(null, { status: 204 })
    const lines = await Promise.all(rest.map(async seg => ({ text: seg.speech ?? seg.text, voice: await segmentVoice(row, seg), delivery: seg.delivery, parts: seg.parts, ...(seg.inner ? { inner: true } : {}) })))
    if (lines.some(l => !l.voice)) return new Response(null, { status: 204 })
    // 한 턴을 여러 번에 나눠 부르므로 한 턴 통째 요청(voice_speak)과 따로 센다.
    if (!(await takeUserQuota(user.id, 'voice_early', [{ ms: 60_000, max: 60 }, { ms: 86_400_000, max: 3000 }]))) return Response.json({ error: 'voice_rate_limited' }, { status: 429 })
    const release = takeVoiceSlot()
    if (!release) return voiceBusy()
    voiceUsed()
    try {
      const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
      const out = await tts.speakTurn({ lines, language: settings?.language ?? 'ko', session: sid, turn: state.turn, more: true, ...(body?.oral === true ? { oral: true } : {}) }, AbortSignal.any([req.signal, AbortSignal.timeout(180_000)]))   // oral: 빠는 장면 — 서버가 그 목소리의 빠는 소리를 문장 사이에 끼운다(한 턴 요청과 같음)
      state.texts.push(...rest.flatMap(seg => seg.parts.map(part => spokenKey(part.text)))); state.at = Date.now()
      for (const l of lines) if (l.voice) state.voices.add(l.voice)
      earlySpoken.set(sid, state)
      return new Response(releasing(out.stream, release, req.signal), { headers: { 'content-type': 'audio/L16', 'x-sample-rate': String(out.sampleRate), 'cache-control': 'private, no-store', 'x-accel-buffering': 'no', 'x-voice': lines.find(l => !l.inner)?.voice ?? lines[0]?.voice ?? '' } })
    } catch { release(); return Response.json({ error: 'voice_generation_failed' }, { status: 502 }) }
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
  // 11/11 감정은 줄마다(parts) — 서버가 바뀌는 줄 앞에 지시를 끼운다. 목소리 결은 한 번에 합성해 그대로.
  const release = takeVoiceSlot()
  if (!release) return voiceBusy()
  voiceUsed()
  if (body?.turn === true && tts.speakTurn) {
    const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
    // 11/23 답이 만들어지는 동안 이미 읽은 줄(early)은 빼고 이어 읽는다 — 앞에서부터 글이 같은 줄까지만(검증에서 글이 바뀐 줄부터는 다시 읽는다: 두 번 나오는 쪽이 빠지는 쪽보다 낫다).
    const said = earlySpoken.get(sessionId); earlySpoken.delete(sessionId)
    let skip = 0
    if (said && Date.now() - said.at < 10 * MIN) { const flat = segments.flatMap(seg => seg.parts); while (skip < said.texts.length && skip < flat.length && spokenKey(flat[skip]!.text) === said.texts[skip]) skip++ }
    const rest = dropSpoken(segments, skip)
    // 다 읽었으면 소리 없이 끝 — 목소리 보상은 미리 읽은 목소리로 여기서 쌓는다.
    if (!rest.length) { release(); void tts.warm?.(AbortSignal.timeout(60_000), sessionId).catch(() => {}); if (said?.voices.size) await accrueVoiceReward({ sessionId, messageId, payerId: user.id, voices: [...said.voices] }).catch(() => {}); return new Response(null, { status: 204 }) }
    const lines = await Promise.all(rest.map(async s => ({ text: s.speech ?? s.text, voice: await segmentVoice(row, s), delivery: s.delivery, parts: s.parts, ...(s.inner ? { inner: true } : {}) })))
    if (lines.some(l => !l.voice)) { release(); return Response.json({ error: 'voice_unavailable' }, { status: 503 }) }
    try {
      const out = await tts.speakTurn({ lines, language: settings?.language ?? 'ko', session: sessionId, turn: said && Date.now() - said.at < 10 * MIN ? said.turn : messageId, ...(body?.oral === true ? { oral: true } : {}) }, AbortSignal.any([req.signal, AbortSignal.timeout(540_000)]))   // 11/17 170초 → 540초: 요청부터 170초에 끊어, 서버가 늦게 켜지거나 답이 길면 소리가 흘러나오던 도중에 뚝 끊겼다
      // 11/12 목소리 보상 — 다른 회원이 올린 목소리로 들었으면 그 턴에 쓴 토큰의 3% 를 목소리 주인에게(실패해도 듣는 데는 영향 없음).
      await accrueVoiceReward({ sessionId, messageId, payerId: user.id, voices: [...new Set([...lines.map(l => l.voice ?? ''), ...(skip ? said!.voices : [])])] }).catch(() => {})
      return new Response(releasing(out.stream, release, req.signal), { headers: { 'content-type': 'audio/L16', 'x-sample-rate': String(out.sampleRate), 'cache-control': 'private, no-store', 'x-accel-buffering': 'no', 'x-voice': lines.find(l => !l.inner)?.voice ?? lines[0]?.voice ?? '' } })
    } catch { release(); return Response.json({ error: 'voice_generation_failed' }, { status: 502 }) }
  }
  const selected = body?.part === undefined ? null : segments[Number(body.part)]
  if (body?.part !== undefined && !selected) { release(); return new Response(null, { status: 400 }) }
  // Preserve the original whole-reply contract for older clients. New clients select each part.
  const text = selected ? (selected.speech ?? selected.text) : segments.map(s => s.speech ?? s.text).join(' ')
  const delivery = selected?.delivery ?? (segments.length === 1 ? segments[0]!.delivery : undefined)
  const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  return synthesize(tts, { text, voice: await segmentVoice(row, selected ?? segments[0]),
    language: settings?.language ?? 'ko', style: delivery?.tone === 'whisper' ? 'whisper' : 'normal', delivery }, req, body?.stream === true, release)
}

/**
 * 11/16 방 목소리 기억 미리 만들기 — 음성 서버는 같은 방의 지난 턴 소리를 이어받아 억양·감정을 잇는다(사용자 청취: 기억이 있는 쪽이 좋다).
 * 기억이 없는 방은 첫 턴이 견본만 보고 밋밋하게 읽혀서, 음성 모드를 켤 때 가장 최근 답의 앞부분을 합성해 서버가 기억하게 한다(11/17: 두 개 → 하나의 앞 200자).
 * 본인 방·읽을 수 있는 답인지는 speechSource 가 확인한다. 실패하면 조용히 그만둔다 — 다음 턴이 기억 없이 읽힐 뿐이다.
 * ponytail: 합성 서버가 한 번에 하나씩 만들어서, 켜자마자 보낸 첫 턴의 소리는 이 작업(최대 30~40초) 뒤로 밀릴 수 있다 — 거슬리면 한 개만 읽히거나 서버에 견본 기억을 둔다.
 */
async function primeRoomVoice(userId: string, sessionId: string): Promise<void> {
  const tts = resolveTts()
  if (!tts?.speakTurn) return
  try {
    const recent = await db.select({ id: messages.id }).from(messages)
      .innerJoin(roleplaySessions, and(eq(roleplaySessions.id, messages.sessionId), eq(roleplaySessions.userId, userId)))
      .where(and(eq(messages.sessionId, sessionId), eq(messages.role, 'character'), eq(messages.kind, 'text'), isNull(messages.hiddenAt)))
      .orderBy(desc(messages.createdAt)).limit(1)   // 11/17 사용자: 음성 모드로 바꾼 직후의 첫 소리가 가장 중요하다 — 두 개(각각 길면 몇 분)를 읽히는 동안 첫 턴의 소리가 그 뒤에 줄 섰다. 가장 최근 답 하나의 앞 200자만.
    const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1)
    for (const m of recent.reverse()) {
      const { row, segments } = await speechSource(userId, sessionId, m.id)
      if (!segments.length) continue
      // 기억은 첫 목소리의 말 한 토막이면 된다(속마음은 서버가 기억에 넣지 않는다) — 약 10초 안에 끝난다.
      const sample = segments.find(s => !s.inner)
      if (!sample) continue
      const voice = await segmentVoice(row, sample)
      if (!voice) return
      const text = (sample.speech ?? sample.text).slice(0, 200)
      const out = await tts.speakTurn({ lines: [{ text, voice, delivery: sample.delivery }], language: settings?.language ?? 'ko', session: sessionId, turn: m.id }, AbortSignal.timeout(60_000))
      const reader = out.stream.getReader()
      while (!(await reader.read()).done) { /* 끝까지 받아야 서버가 그 턴을 기억한다 */ }
    }
  } catch { /* 기억 없이 간다 */ }
}

/**
 * 11/11 stream=true 면 만드는 대로 PCM16 조각을 그대로 흘려보낸다(audio/L16, x-sample-rate) — 첫소리가 대사 전체 합성을 기다리지 않는다.
 * 스트리밍을 못 하는 합성 서버면 예전처럼 WAV 하나.
 */
async function synthesize(tts: TtsProvider, request: TtsRequest, req: Request, stream: boolean, release: () => void): Promise<Response> {
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(170_000)])
    if (stream && tts.speakStream) {
      const out = await tts.speakStream(request, signal)
      return new Response(releasing(out.stream, release, req.signal), { headers: { 'content-type': 'audio/L16', 'x-sample-rate': String(out.sampleRate), 'cache-control': 'private, no-store', 'x-accel-buffering': 'no' } })
    }
    const out = await tts.speak(request, signal)
    release()
    return new Response(out.audio, { headers: { 'content-type': out.contentType, 'cache-control': 'private, no-store' } })
  } catch {
    release()
    // No automatic paid retry and no substitution with an unrelated browser voice.
    return Response.json({ error: 'voice_generation_failed' }, { status: 502 })
  }
}
