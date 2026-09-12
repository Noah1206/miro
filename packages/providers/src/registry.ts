import { GatewayLLMProvider } from './llm/gateway'
import { MockLLMProvider } from './mock/llm'
import { MockImageProvider } from './mock/image'
import { buildMockDraft } from './character/generate'
import type { ImageProvider, LLMProvider } from './types'
import { MockPushProvider } from './push/mock'
import { WebPushProvider } from './push/webpush'
import type { PushProvider } from './push/types'
import { MockCallMediaProvider } from './call/mock'
import type { CallMediaProvider } from './call/types'

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

export function resolveImage(): ImageProvider {
  // Image Provider 확정 시 여기에 live adapter 를 추가한다.
  return new MockImageProvider()
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
 * 음성/영상 Provider. 확정되면 여기서 env 로 분기해 live adapter 를 반환한다.
 * Domain/서비스 코드는 바뀌지 않는다.
 */
export function resolveCallMedia(kind: 'voice' | 'video'): CallMediaProvider {
  return new MockCallMediaProvider(kind)
}
