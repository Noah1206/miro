import type { ProviderInfo } from '../types'
import type { CallMediaProvider, CallMediaSession, CallMediaSpec } from './types'

// Ephemeral tokens connect only to the Constrained method; plain BidiGenerateContent closes them with 1008 (measured 2026-09-24).
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'

/**
 * Gemini Live API 어댑터 — 음성 전용.
 *
 * 서버는 ephemeral token 만 발급한다. 클라이언트가 그 토큰으로 Google 에 직접
 * WebSocket 을 연결하므로 상시 서버가 필요 없고, 세션은 Google 이 들고 있는다.
 * 모델·시스템 프롬프트·보이스를 토큰의 bidiGenerateContentSetup 에 담는다 — fieldMask 가 비어 있으면
 * 클라이언트가 보내는 setup 은 무시되므로 다른 지시문으로 바꿔치기할 수 없다.
 * (REST 이름이다. SDK 의 liveConnectConstraints 를 그대로 보내면 400 — 2026-09-24 실측.)
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
        bidiGenerateContentSetup: {
          model: `models/${this.model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: spec.voiceName ?? this.defaultVoice } },
            },
            // 통화는 침묵이 길면 끊긴 것 같다. 생각을 끄면 첫 목소리가 3.0초 → 2.2초(연결 포함, 2026-09-24 실측).
            // thinkingLevel 은 이 모델이 거부한다(1007).
            thinkingConfig: { thinkingBudget: 0 },
          },
          ...(spec.systemInstruction
            ? { systemInstruction: { parts: [{ text: spec.systemInstruction }] } }
            : {}),
          // 두 사람의 말을 글로 돌려받는다 — 통화 내용을 채팅 턴처럼 기억·관계에 남기기 위해서다.
          inputAudioTranscription: {},
          outputAudioTranscription: {},
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
