/**
 * 몰입 모드 읽기(10/19) — 캐릭터의 답을 목소리로. 음성 합성 서버는 HTTP 하나다(참고 구현: tooling/voice/server.py).
 *   POST {MIRO_TTS_URL}/speak  { text, voice, language, style? }  → 오디오 바이트(content-type 그대로 전달)
 * voice 는 official_voices.provider_voice_id(없으면 null = 서버 기본 목소리). 서버가 없으면 null — 화면은 브라우저 읽기로 대신한다.
 */
/** style: 'normal' = 보통 대화, 'whisper' = 속삭임 장면(10/21). 서버가 모르면 무시한다. */
export type TtsRequest = { text: string; voice: string | null; language: string; style?: 'normal' | 'whisper' }
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
      return { audio: await res.arrayBuffer(), contentType: res.headers.get('content-type') ?? 'audio/wav' }
    },
  }
}
