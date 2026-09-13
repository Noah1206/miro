import { GatewayLLMProvider } from './llm/gateway'
import { MockLLMProvider } from './mock/llm'
import { MockImageProvider } from './mock/image'
import { ReplicateImageProvider } from './image/replicate'
import { buildMockDraft } from './character/generate'
import type { ImageProvider, LLMProvider } from './types'
import { MockPushProvider } from './push/mock'
import { WebPushProvider } from './push/webpush'
import type { PushProvider } from './push/types'
import { MockCallMediaProvider } from './call/mock'
import { LiveKitCallMediaProvider } from './call/livekit'
import type { CallMediaProvider } from './call/types'
import { MockAdultVerificationProvider } from './verify/mock'
import type { AdultVerificationProvider } from './verify/types'
import { MockPaymentProvider } from './payment/mock'
import { StripePaymentProvider } from './payment/stripe'
import type { PaymentProvider } from './payment/types'
import { OAuth2Provider } from './auth/oauth'
import { MockOAuthProvider } from './auth/mock'
import type { OAuthProvider, OAuthProviderId } from './auth/types'

/**
 * Provider 선택.
 * 설정이 없으면 Mock 으로 떨어지되, info.mode 로 그 사실을 숨기지 않는다.
 */
export function resolveLLM(): LLMProvider {
  const key = process.env.AI_GATEWAY_API_KEY
  const model = process.env.MIRO_LLM_MODEL
  if (key && model) return new GatewayLLMProvider(key, model)
  return new MockLLMProvider((prompt) => buildMockDraft(prompt))
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
  const forceMock = process.env.MIRO_MOCK_OAUTH === '1' && process.env.VERCEL_ENV !== 'production'
  if (forceMock) return new MockOAuthProvider(id)
  const key = id.toUpperCase()
  const clientId = process.env[`${key}_CLIENT_ID`], secret = process.env[`${key}_CLIENT_SECRET`]
  return clientId && secret ? new OAuth2Provider(id, clientId, secret) : new MockOAuthProvider(id)
}
