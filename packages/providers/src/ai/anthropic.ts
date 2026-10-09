import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, GenerationRequest, GenerationResult } from './types'

/**
 * Claude (Anthropic Messages API, 공식 SDK). 10/9 Gemini 결제 계정 정지로 주 공급자가 됐다.
 * - 재시도·429 대기·예비 전환은 오케스트레이터의 일이라 SDK 재시도는 끈다(maxRetries 0). 실패는 Gemini 와 같은 이름(provider_http_<상태>)으로 던진다.
 * - Sonnet 5.5 는 생각을 끌 수 없고 temperature 를 바꾸면 400 이다 — 생각 깊이(effort)만 고른다. 기본은 low(대화·분류는 속도가 먼저),
 *   req.thinking 을 준 호출(일회성 정리)만 그 수준으로.
 * - 정책 거절은 서버 쪽 예비(fallbacks: "default")가 다른 모델로 한 번 더 해 본다. 그래도 거절이면 blocked.
 */
export class AnthropicProvider implements AIProvider {
  readonly info
  private readonly client: Anthropic
  constructor(key: string, private readonly model: string) {
    this.info = { mode: 'live' as const, name: `anthropic/${model}`, notice: null }
    this.client = new Anthropic({ apiKey: key, maxRetries: 0 })
  }

  async healthCheck(): Promise<boolean> {
    try { await this.client.models.retrieve(this.model, {}, { timeout: 5000 }); return true } catch { return false }
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const start = Date.now()
    let response: Anthropic.Beta.BetaMessage
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        system: req.system + (req.json ? '\nReturn only a JSON object.' : ''),
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { effort: req.thinking ?? 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }, { signal: req.signal })
    } catch (e) {
      if (e instanceof Anthropic.APIError && e.status) throw new Error(`provider_http_${e.status}`)
      throw e
    }
    return {
      blocked: response.stop_reason === 'refusal',
      text: response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim(),
      provider: 'anthropic', model: response.model,
      inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - start,
      truncated: response.stop_reason === 'max_tokens',
    }
  }
}
