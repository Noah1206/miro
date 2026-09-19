import type { ProviderInfo } from '../types'
import type { CallMediaProvider, CallMediaSession, CallMediaSpec } from './types'

const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'

/**
 * Gemini Live API 어댑터 — 음성 전용.
 *
 * 서버는 ephemeral token 만 발급한다. 클라이언트가 그 토큰으로 Google 에 직접
 * WebSocket 을 연결하므로 상시 서버가 필요 없고, 세션은 Google 이 들고 있는다.
 * 모델·시스템 프롬프트·보이스를 토큰의 liveConnectConstraints 에 잠가 두어
 * 클라이언트가 다른 지시문으로 바꿔치기할 수 없다.
 *
 * 세션 자체 한도: 오디오 전용 15분 (API 상한). 우리 쪽 상한은 POLICY.call.maxMinutes 와
 * expireCalls cron 이 따로 건다. 오디오 과금은 초당 25토큰 — 입력 $0.005/분, 출력 $0.018/분
 * (2026-09-19 공식 가격표 기준. 변경 가능하므로 개방 전 재확인한다).
 */
export class GeminiLiveCallMediaProvider implements CallMediaProvider {
  readonly kind = 'voice' as const
  readonly info: ProviderInfo

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly defaultVoice: string,
  ) {
    this.info = { mode: 'live', name: 'gemini-live', notice: null }
  }

  async startSession(spec: CallMediaSpec): Promise<CallMediaSession> {
    const now = Date.now()
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        uses: 1,
        // 토큰 수명은 통화 상한을 넉넉히 덮되, 새 세션 시작은 2분 안에만 허용한다.
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 2 * 60_000).toISOString(),
        liveConnectConstraints: {
          model: `models/${this.model}`,
          config: {
            responseModalities: ['AUDIO'],
            ...(spec.systemInstruction
              ? { systemInstruction: { parts: [{ text: spec.systemInstruction }] } }
              : {}),
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: spec.voiceName ?? this.defaultVoice } },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`gemini_live_token_failed:${res.status}`)
    const body = (await res.json()) as { name?: string }
    if (!body.name) throw new Error('gemini_live_token_failed:empty')
    return { token: body.name, mode: 'live', connectUrl: WS_URL, model: `models/${this.model}` }
  }

  /** Google 세션은 WebSocket 이 닫히면 끝난다 — 서버가 정리할 자원이 없다. */
  async endSession(): Promise<void> {}
}
