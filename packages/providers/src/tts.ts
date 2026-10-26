/**
 * 몰입 모드 읽기(10/19) — 캐릭터의 답을 목소리로. 음성 합성 서버는 HTTP 하나다(참고 구현: tooling/voice/server.py).
 *   POST {MIRO_TTS_URL}/speak  { text, voice, language, style?, delivery? } → 오디오 바이트
 * voice 는 official_voices.provider_voice_id. 미설정 시 null을 반환하고 UI는 실패 상태를 표시한다.
 */
import type { VoiceDelivery } from '@miro/config'
/** delivery is per utterance. style remains for older speech servers. */
export type TtsRequest = { text: string; voice: string | null; language: string; style?: 'normal' | 'whisper'; delivery?: VoiceDelivery; maxAudioSeconds?: number }
export type TtsProvider = { speak(req: TtsRequest, signal?: AbortSignal): Promise<{ audio: ArrayBuffer; contentType: string }> }

export function resolveTts(): TtsProvider | null {
  const url = process.env.MIRO_TTS_URL?.replace(/\/$/, '')
  if (!url) return null
  const key = process.env.MIRO_TTS_API_KEY
  return {
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
