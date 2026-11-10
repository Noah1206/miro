import { createHmac, timingSafeEqual } from 'node:crypto'
import { voiceDelivery, type VoiceDelivery } from '@miro/config'
import { matchSpeaker } from '../voice-text'

/**
 * 11/11 글과 같이 읽기(사용자: "채팅이 쳐질 때 음성이 나와야 한다") — 답이 생성되는 동안 같은 사람의 대사가 모이면 바로 읽을 묶음으로 내보낸다.
 * 저장 전의 글이라 메시지 id 가 없다 — 서버가 만든 글이라는 증표(서명)를 붙여 클라이언트가 그대로 /api/tts 로 돌려보낸다(임의의 글은 읽지 않는다).
 * 묶음 규칙은 저장 뒤 읽기(lib/voice-text spokenSegments)와 같다: 같은 사람이 이어 하는 말은 한 묶음, 카드 이름 줄이 먼저 없으면 처음 말한 사람이 주인공.
 * 다만 기다리지 않으려고 LIVE_GROUP 자 넘게 모이면 먼저 보낸다 — 이때도 한 사람의 말은 감정·말투를 첫 줄 것 하나로 맞추고, 서버 씨앗도 목소리마다 같아 이어 들린다.
 */
export const LIVE_GROUP = 150
/** 첫 묶음은 짧게(11/11) — 대사가 150자 쌓일 때까지 기다리지 않고 첫소리를 빨리. */
export const LIVE_FIRST = 60
const MAX_TEXT = 500
const WHISPER_CUES = /속삭|귓가|귓속|귀에 대고|귀엣말|소곤|숨죽|목소리를 낮|낮게 읊|작게 말|작은 목소리/
export type LiveSpeech = { text: string; speaker: string | null; delivery: VoiceDelivery }
type Pending = { speaker: string | null; texts: string[]; delivery: VoiceDelivery }

export function liveGrouper(characterName: string, speakers: readonly string[]) {
  let seen = 0, sent = 0, lead: string | null | undefined, pending: Pending | null = null
  const deliveries = new Map<string, VoiceDelivery>()
  const flush = (out: LiveSpeech[]) => {
    if (pending?.texts.length) { out.push({ text: pending.texts.join(' ').slice(0, MAX_TEXT), speaker: pending.speaker, delivery: pending.delivery }); sent++ }
    pending = null
  }
  return {
    /** 지금까지 다 닫힌 블록 전체 → 새로 읽을 묶음. */
    push(blocks: ReadonlyArray<Record<string, unknown>>): LiveSpeech[] {
      const out: LiveSpeech[] = []
      const lines: Array<{ text: string; speaker: string | null; delivery: VoiceDelivery }> = []
      let whisper = false
      for (const b of blocks) {
        if (b.type === 'action' || b.type === 'narrative') { whisper = typeof b.text === 'string' && WHISPER_CUES.test(b.text); continue }
        if (b.type !== 'dialogue' || typeof b.text !== 'string' || !b.text.trim()) continue
        const raw = typeof b.speaker === 'string' && b.speaker !== characterName ? b.speaker : null
        if (raw && /^(나|당신|유저|사용자|user)$/i.test(raw.trim())) continue
        lines.push({ text: b.text.trim(), speaker: raw, delivery: voiceDelivery(b.delivery, whisper) }); whisper = false
      }
      for (const l of lines.slice(seen)) {
        // 주인공: 카드 이름 줄이 먼저 나오면 카드 이름, 아니면 처음 말한 (목록에 없는) 사람.
        if (lead === undefined) lead = l.speaker && !matchSpeaker(l.speaker, speakers) ? l.speaker : null
        const speaker = l.speaker === lead ? null : l.speaker
        const key = speaker ?? ''
        if (!deliveries.has(key)) deliveries.set(key, l.delivery)
        if (pending && pending.speaker !== speaker) flush(out)
        pending ??= { speaker, texts: [], delivery: deliveries.get(key)! }
        pending.texts.push(l.text)
        if (pending.texts.join(' ').length >= (sent ? LIVE_GROUP : LIVE_FIRST)) flush(out)
      }
      seen = lines.length
      return out
    },
    /** 생성이 끝났다 — 남은 묶음. */
    end(): LiveSpeech[] { const out: LiveSpeech[] = []; flush(out); return out },
  }
}

const secret = () => process.env.MIRO_TTS_API_KEY ?? (process.env.NODE_ENV === 'production' ? null : 'dev')
const body = (userId: string, sessionId: string, s: LiveSpeech, exp: number) => `live-speech:${userId}|${sessionId}|${s.speaker ?? ''}|${JSON.stringify(s.delivery)}|${s.text}|${exp}`

/** 10분 동안 이 사용자·이 방에서만 쓸 수 있는 증표. 비밀값이 없으면 null(글과 같이 읽기를 끈다). */
export function signLive(userId: string, sessionId: string, s: LiveSpeech, now = Date.now()): { exp: number; token: string } | null {
  const key = secret(); if (!key) return null
  const exp = now + 600_000
  return { exp, token: createHmac('sha256', key).update(body(userId, sessionId, s, exp)).digest('base64url') }
}

export function verifyLive(userId: string, sessionId: string, raw: unknown, now = Date.now()): LiveSpeech | null {
  const key = secret(); if (!key || !raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.text !== 'string' || !r.text.trim() || r.text.length > MAX_TEXT || (r.speaker !== null && typeof r.speaker !== 'string')
    || typeof r.exp !== 'number' || r.exp < now || typeof r.token !== 'string') return null
  const s: LiveSpeech = { text: r.text, speaker: r.speaker as string | null, delivery: voiceDelivery(r.delivery) }
  const want = Buffer.from(createHmac('sha256', key).update(body(userId, sessionId, s, r.exp)).digest('base64url')), got = Buffer.from(r.token)
  return want.length === got.length && timingSafeEqual(want, got) ? s : null
}

if (process.argv[1]?.endsWith('live.ts')) {
  const g = liveGrouper('카드', [])
  const a = g.push([{ type: 'dialogue', speaker: '예린', text: '가.' }])
  const b = g.push([{ type: 'dialogue', speaker: '예린', text: '가.' }, { type: 'narrative', text: '돌아선다.' }, { type: 'dialogue', speaker: '민수', text: '어디 가?' }])
  const c = g.end()
  console.assert(a.length === 0 && b.length === 1 && b[0]!.text === '가.' && b[0]!.speaker === null && c.length === 1 && c[0]!.speaker === '민수', JSON.stringify({ a, b, c }))
  const s = { text: '안녕', speaker: null, delivery: voiceDelivery(null) }
  const t = signLive('u', 's', s)!
  console.assert(verifyLive('u', 's', { ...s, ...t }) !== null && verifyLive('u', 'x', { ...s, ...t }) === null && verifyLive('u', 's', { ...s, ...t, text: '바꿈' }) === null)
}
