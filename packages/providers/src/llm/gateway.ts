import type { ZodType, ZodTypeDef } from 'zod'
import { POLICY } from '@miro/config'
import type { LLMProvider, ProviderInfo } from '../types'

/**
 * AI Gateway 경유 LLM Adapter.
 *
 * 모델은 "provider/model" 문자열로만 지정한다 — Provider 교체가 설정값 변경으로 끝난다.
 * Domain 은 이 파일을 import 하지 않는다.
 */
export class GatewayLLMProvider implements LLMProvider {
  readonly info: ProviderInfo

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = 'https://ai-gateway.vercel.sh/v1',
  ) {
    this.info = { mode: 'live', name: model, notice: null }
  }

  async generateStructured<Out, In = Out>(opts: {
    schema: ZodType<Out, ZodTypeDef, In>
    system: string
    prompt: string
    maxRetries?: number
  }): Promise<Out> {
    const maxRetries = opts.maxRetries ?? POLICY.generation.maxRetries
    let lastError = ''

    // 스키마 위반 시에만 제한 재시도. 무한 재시도 금지.
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const raw = await this.call(
        opts.system,
        attempt === 0 ? opts.prompt
          : `${opts.prompt}\n\n이전 출력이 스키마를 위반했습니다: ${lastError}\n올바른 JSON만 반환하세요.`,
      )

      const json = extractJson(raw)
      if (json === null) { lastError = 'JSON 파싱 실패'; continue }

      const parsed = opts.schema.safeParse(json)
      if (parsed.success) return parsed.data
      lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    }

    throw new Error(`structured generation failed after ${maxRetries + 1} attempts: ${lastError}`)
  }

  private async call(system: string, prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status} ${await res.text().catch(() => '')}`)
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return body.choices?.[0]?.message?.content ?? ''
  }
}

/** 모델이 코드 펜스나 설명을 덧붙여도 JSON 본문만 건져낸다. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      return null
    }
  }
}
