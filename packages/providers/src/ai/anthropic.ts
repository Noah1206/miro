import Anthropic from '@anthropic-ai/sdk'
import type { AIProvider, GenerationRequest, GenerationResult } from './types'

/**
 * Claude (Anthropic Messages API, 공식 SDK). 10/9 Gemini 결제 계정 정지로 주 공급자가 됐다.
 * - 재시도·429 대기·예비 전환은 오케스트레이터의 일이라 SDK 재시도는 끈다(maxRetries 0). 실패는 Gemini 와 같은 이름(provider_http_<상태>)으로 던진다.
 * - Sonnet 5.5 는 생각을 끌 수 없고 temperature 를 바꾸면 400 이다 — 생각 깊이(effort)만 고른다. 기본은 low(대화·분류는 속도가 먼저),
 *   req.thinking 을 준 호출(일회성 정리)만 그 수준으로.
 * - 정책 거절은 서버 쪽 예비(fallbacks: "default")가 다른 모델로 한 번 더 해 본다. 그래도 거절이면 blocked.
 * - 응답 스키마가 있으면 그 스키마의 도구(submit)로 답을 받는다 — 글로 받으면 계획 JSON 이 가끔 깨져 와 한 턴에 두 번 다시 불렀다(10/9 실측).
 *   도구 입력은 늘 올바른 JSON 이다. 구조화 출력(output_config.format)은 계획 스키마가 커서 거절된다("compiled grammar is too large").
 *   Sonnet 5.5 는 도구 강제(tool_choice any/tool)를 받지 않아 auto + 지시로 부르고, 안 부르면 글 답을 그대로 쓴다.
 */

/**
 * Gemini 용 응답 스키마를 Claude 도구 입력 스키마로: 모든 객체에 additionalProperties:false, 숫자·길이 제약은 뺀다(검증은 호출한 쪽 zod 가 한다).
 */
export function claudeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(claudeSchema)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern'].includes(key)) continue
    out[key] = key === 'properties' && value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([name, prop]) => [name, claudeSchema(prop)])) : claudeSchema(value)
  }
  if (out.type === 'object') out.additionalProperties = false
  return out
}
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
    const schema = req.responseSchema ? claudeSchema(req.responseSchema) as Anthropic.Beta.BetaTool.InputSchema : null
    let response: Anthropic.Beta.BetaMessage
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens ?? 1024,
        system: req.system + (schema ? '\nCall the submit tool exactly once with the complete result. Do not answer in text.' : req.json ? '\nReturn only a JSON object.' : ''),
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { effort: req.thinking ?? 'low' },
        ...(schema ? { tools: [{ name: 'submit', description: 'Submit the complete result.', input_schema: schema }], tool_choice: { type: 'auto' as const } } : {}),
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }, { signal: req.signal })
    } catch (e) {
      if (e instanceof Anthropic.APIError && e.status) throw new Error(`provider_http_${e.status}`)
      throw e
    }
    const submitted = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'submit')
    return {
      blocked: response.stop_reason === 'refusal',
      text: submitted ? JSON.stringify(submitted.input) : response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim(),
      provider: 'anthropic', model: response.model,
      inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - start,
      truncated: response.stop_reason === 'max_tokens',
    }
  }
}
