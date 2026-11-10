/**
 * 몰입 모드 읽기(10/19) — 캐릭터의 답을 목소리로. 음성 합성 서버는 HTTP 하나다(참고 구현: tooling/voice/server.py).
 *   POST {MIRO_TTS_URL}/speak  { text, voice, language, style?, delivery? } → 오디오 바이트
 * voice 는 official_voices.provider_voice_id. 미설정 시 null을 반환하고 UI는 실패 상태를 표시한다.
 */
import type { VoiceDelivery } from '@miro/config'
/** delivery is per utterance. style remains for older speech servers. */
export type TtsRequest = { text: string; voice: string | null; language: string; style?: 'normal' | 'whisper'; delivery?: VoiceDelivery; maxAudioSeconds?: number }
export type TtsProvider = { speak(req: TtsRequest, signal?: AbortSignal): Promise<{ audio: ArrayBuffer; contentType: string }>
  /** 11/6: 서버를 미리 깨운다(꺼져 있으면 켜지는 데 24~33초) — 음성 모드를 켜는 순간 부른다. 실패해도 조용히. */
  warm?(signal?: AbortSignal): Promise<void>
  /** 11/11 만드는 대로 받기 — PCM16 모노 조각 스트림(sampleRate 와 함께). 첫 조각까지 약 1초. */
  speakStream?(req: TtsRequest, signal?: AbortSignal): Promise<{ stream: ReadableStream<Uint8Array>; sampleRate: number }>
  /** 11/11 한 턴 통째 — 대화 순서의 대사 묶음. 목소리마다 한 번에 합성해 잘라 순서대로(서버 /speak_turn). */
  speakTurn?(req: { lines: Array<{ text: string; voice: string | null; delivery?: VoiceDelivery; parts?: Array<{ text: string; delivery: VoiceDelivery }> }>; language: string }, signal?: AbortSignal): Promise<{ stream: ReadableStream<Uint8Array>; sampleRate: number }> }

export function resolveTts(): TtsProvider | null {
  const url = process.env.MIRO_TTS_URL?.replace(/\/$/, '')
  if (!url) return null
  const key = process.env.MIRO_TTS_API_KEY
  /** 만드는 대로 받는 PCM16 조각(x-sample-rate) — /speak_stream(대사 하나)·/speak_turn(한 턴 통째) 공통. */
  const stream = async (path: string, body: unknown, signal?: AbortSignal) => {
    const res = await fetch(`${url}${path}`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body),
    })
    const sampleRate = Number(res.headers.get('x-sample-rate'))
    if (!res.ok || !res.body || !(sampleRate > 0)) { await res.body?.cancel(); throw new Error(`tts stream ${res.status}`) }
    return { stream: res.body, sampleRate }
  }
  return {
    async warm(signal) { await fetch(`${url}/health`, { signal }).then(r => r.body?.cancel()).catch(() => {}) },
    speakTurn: (req, signal) => stream('/speak_turn', req, signal),
    speakStream: (req, signal) => stream('/speak_stream', req, signal),
    async speak(req, signal) {
      const res = await fetch(`${url}/speak`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify(req),
      })
      if (!res.ok) throw new Error(`tts server ${res.status}`)
      const contentType = res.headers.get('content-type') ?? 'audio/wav'
      const maximum = 4 * 1024 * 1024
      if (!contentType.startsWith('audio/') || Number(res.headers.get('content-length')) > maximum) {
        await res.body?.cancel(); throw new Error('invalid tts audio')
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('empty tts audio')
      const chunks: Uint8Array[] = []; let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break
          size += value.byteLength
          if (size > maximum) { await reader.cancel(); throw new Error('tts audio too large') }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      if (!size) throw new Error('empty tts audio')
      const audio = new Uint8Array(size); let offset = 0
      for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.byteLength }
      return { audio: audio.buffer, contentType }
    },
  }
}
