import { mockProvidersAllowed } from '@miro/config'
import { createAI } from './ai/resolve'
import { MockImageProvider } from './mock/image'
import { ReplicateImageProvider } from './image/replicate'
import { buildMockDraft } from './character/generate'
import type { ImageProvider, LLMProvider } from './types'
import { MockPushProvider } from './push/mock'
import { WebPushProvider } from './push/webpush'
import type { PushProvider } from './push/types'
import { MockCallMediaProvider } from './call/mock'
import { LiveKitCallMediaProvider } from './call/livekit'
import { GeminiLiveCallMediaProvider } from './call/gemini-live'
import type { CallMediaProvider } from './call/types'
import { MockAdultVerificationProvider } from './verify/mock'
import type { AdultVerificationProvider } from './verify/types'
import { MockPaymentProvider } from './payment/mock'
import { StripePaymentProvider } from './payment/stripe'
import type { PaymentProvider } from './payment/types'
import { OAuth2Provider } from './auth/oauth'
import { MockOAuthProvider } from './auth/mock'
import { SupabaseOAuthProvider } from './auth/supabase'
import type { OAuthProvider, OAuthProviderId } from './auth/types'

/**
 * Provider 선택.
 * 설정이 없으면 Mock 으로 떨어지되, info.mode 로 그 사실을 숨기지 않는다.
 */
/**
 * 구조화 생성용 LLM = AI Orchestrator (체인·재시도·타임아웃·fallback·사용량).
 * Provider 가 하나도 없으면 Mock 체인 — 캐릭터 초안 생성의 Mock 은 프롬프트에서 결정적으로 만든다.
 */
export function resolveLLM(context?: { userId?: string | null; sessionId?: string | null }): LLMProvider {
  return createAI({ mock: (req) => buildMockDraft(req.prompt), context })
}

/** 이미지. REPLICATE_API_TOKEN 이 있으면 실제 생성, 없으면 자리표시. */
export function resolveImage(): ImageProvider {
  const token = process.env.REPLICATE_API_TOKEN
  return token ? new ReplicateImageProvider(token) : new MockImageProvider()
}

let pushSingleton: PushProvider | null = null

/** Push Provider. VAPID 키가 없으면 Mock — 발송되지 않는다는 사실을 숨기지 않는다. */
export function resolvePush(): PushProvider {
  if (pushSingleton) return pushSingleton
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  pushSingleton = publicKey && privateKey && subject
    ? new WebPushProvider({ subject, publicKey, privateKey })
    : new MockPushProvider()
  return pushSingleton
}

/**
 * 음성/영상 Provider. LiveKit 자격증명이 모두 있으면 실시간 세션, 없으면 텍스트 대체.
 * Domain/서비스 코드는 어느 쪽이든 바뀌지 않는다.
 */
export function resolveCallMedia(kind: 'voice' | 'video'): CallMediaProvider {
  // 음성은 Gemini Live 가 기본 — 서버 없이 클라이언트가 Google 에 직결한다.
  if (kind === 'voice' && process.env.GEMINI_API_KEY) {
    return new GeminiLiveCallMediaProvider(
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
      process.env.GEMINI_LIVE_VOICE || 'Kore',
    )
  }
  const key = process.env.LIVEKIT_API_KEY
  const secret = process.env.LIVEKIT_API_SECRET
  const url = process.env.LIVEKIT_URL
  return key && secret && url
    ? new LiveKitCallMediaProvider(kind, key, secret, url)
    : new MockCallMediaProvider(kind)
}

/** 성인 인증 Provider. 확정되면 env 로 분기한다. */
export function resolveAdultVerification(): AdultVerificationProvider {
  return new MockAdultVerificationProvider()
}

let paymentSingleton: PaymentProvider | null = null
/** 결제 Provider. Stripe 키가 모두 있으면 실제 결제, 없으면 시뮬레이션. */
export function resolvePayment(): PaymentProvider {
  if (paymentSingleton) return paymentSingleton
  const key = process.env.STRIPE_SECRET_KEY
  const hook = process.env.STRIPE_WEBHOOK_SECRET
  const price = process.env.STRIPE_PRICE_ID
  const base = process.env.AUTH_BASE_URL ?? 'http://localhost:3000'
  paymentSingleton = key && hook && price
    ? new StripePaymentProvider(key, hook, price, `${base}/subscribe/result?status=success`, `${base}/subscribe?status=cancel`)
    : new MockPaymentProvider()
  return paymentSingleton
}

/**
 * 소셜 로그인. `${PROVIDER}_CLIENT_ID/SECRET` 가 있으면 실제 OAuth, 없으면 시뮬레이션.
 *
 * `MIRO_MOCK_OAUTH=1` 이면 키가 있어도 시뮬레이션을 쓴다 — E2E 는 실제 구글·카카오 계정으로
 * 로그인할 수 없기 때문이다. 로컬 E2E 도 `next start`(NODE_ENV=production) 로 돌므로
 * NODE_ENV 로는 구분할 수 없다. 실제 배포 환경(VERCEL_ENV=production) 에서만 무시한다.
 */
export function resolveOAuth(id: OAuthProviderId): OAuthProvider {
  const forceMock = process.env.MIRO_MOCK_OAUTH === '1' && mockProvidersAllowed()
  if (forceMock) return new MockOAuthProvider(id)
  if (process.env.AUTH_PROVIDER === 'supabase') {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
    if (!url || !key) throw new Error('Supabase Auth URL or public API key missing')
    return new SupabaseOAuthProvider(id, url, key)
  }
  const key = id.toUpperCase()
  const clientId = process.env[`${key}_CLIENT_ID`], secret = process.env[`${key}_CLIENT_SECRET`]
  return clientId && secret ? new OAuth2Provider(id, clientId, secret) : new MockOAuthProvider(id)
}
