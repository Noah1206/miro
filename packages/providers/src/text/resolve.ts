import { CloudflareTextProvider } from './cloudflare'
import { GeminiTextProvider } from './gemini'
import { MockTextProvider } from './mock'
import type { AIInput, AIProvider } from './types'

/**
 * 자유 텍스트 Provider. `AI_PROVIDER` 로 고른다 — 코드는 어느 모델에도 묶이지 않는다.
 *   gemini      GEMINI_API_KEY (+ GEMINI_MODEL)
 *   cloudflare  CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_AI_MODEL)
 * 키가 없으면 Mock — 호출자가 준 함수로 정해진 대사를 돌려준다.
 */
export function resolveTextAI(fallback: (input: AIInput) => string): AIProvider {
  const which = (process.env.AI_PROVIDER ?? '').toLowerCase()
  if (which === 'gemini' && process.env.GEMINI_API_KEY) {
    return new GeminiTextProvider(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || undefined)
  }
  if (which === 'cloudflare' && process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    return new CloudflareTextProvider(process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_API_TOKEN, process.env.CLOUDFLARE_AI_MODEL || undefined)
  }
  return new MockTextProvider(fallback)
}
