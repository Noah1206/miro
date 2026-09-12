import { createHmac } from 'node:crypto'
import type { ProviderInfo } from '../types'
import type { CallMediaProvider, CallMediaSession, CallMediaSpec } from './types'

/**
 * LiveKit 실시간 미디어 Adapter.
 *
 * 여기서 하는 일은 "이 통화에 붙을 수 있는 토큰" 발급까지다. 캐릭터의 목소리(TTS)와
 * 응답 지연은 별도 에이전트의 몫이며, 이 Adapter 는 방과 신원만 만든다 —
 * 토큰에 담긴 room 이름으로 에이전트가 같은 방에 들어온다.
 *
 * SDK 를 쓰지 않고 JWT 를 직접 서명한다 (의존성 추가 없이 HS256 한 번).
 */
export class LiveKitCallMediaProvider implements CallMediaProvider {
  readonly info: ProviderInfo

  constructor(
    readonly kind: 'voice' | 'video',
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly url: string,
  ) {
    this.info = { mode: 'live', name: `livekit-${kind}`, notice: null }
  }

  async startSession(spec: CallMediaSpec): Promise<CallMediaSession> {
    const room = `miro-${spec.callId}`
    const now = Math.floor(Date.now() / 1000)
    const token = sign(this.apiKey, this.apiSecret, {
      // 사용자는 자기 자신으로 참가하고, 캐릭터는 에이전트가 같은 room 으로 들어온다.
      sub: `user-${spec.callId}`,
      name: spec.characterName,
      nbf: now,
      exp: now + 60 * 60,
      video: {
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        // 음성통화에서는 카메라를 올리지 않는다.
        canPublishSources: this.kind === 'voice' ? ['microphone'] : ['microphone', 'camera'],
      },
      metadata: JSON.stringify({
        characterName: spec.characterName,
        voiceIdentity: spec.voiceIdentity,
        visualPrompt: this.kind === 'video' ? spec.visualPrompt : null,
      }),
    })
    return { token, mode: 'live', connectUrl: this.url }
  }

  /**
   * 방 정리. 서버 API 는 같은 자격증명으로 서명한 토큰을 요구한다.
   * 실패해도 통화 종료 자체는 이미 DB 에 기록되므로 throw 하지 않는다.
   */
  async endSession(token: string): Promise<void> {
    const room = roomOf(token)
    if (!room) return
    const now = Math.floor(Date.now() / 1000)
    const admin = sign(this.apiKey, this.apiSecret, {
      sub: 'miro-server', nbf: now, exp: now + 60,
      video: { roomAdmin: true, room },
    })
    await fetch(`${this.url.replace(/^ws/, 'http')}/twirp/livekit.RoomService/DeleteRoom`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ room }),
    }).catch(() => undefined)
  }
}

function sign(apiKey: string, secret: string, claims: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = enc({ alg: 'HS256', typ: 'JWT' })
  const body = enc({ iss: apiKey, ...claims })
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

function roomOf(token: string): string | null {
  try {
    const [, body] = token.split('.')
    const c = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8')) as { video?: { room?: string } }
    return c.video?.room ?? null
  } catch { return null }
}
