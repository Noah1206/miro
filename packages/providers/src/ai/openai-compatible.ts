import type { AIProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderInfo } from '../types'

/**
 * OpenAI 호환 chat/completions 엔드포인트 — Vercel AI Gateway(모델은 "provider/model"), OpenAI, 로컬 서버(Ollama 등) 전부 이 하나로 붙는다.
 * Anthropic·OpenAI 유료 모델로 바꿀 때는 baseUrl 과 model 만 달라진다.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly info: ProviderInfo
  constructor(
    private readonly name: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
  ) {
    this.info = { mode: 'live', name: `${name}/${model}`, notice: null }
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now()
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: req.signal,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }],
        max_tokens: req.maxTokens ?? 1024, temperature: req.temperature ?? 0.9,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) throw new Error(`${this.name} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    return {
      text: (body.choices?.[0]?.message?.content ?? '').trim(),
      provider: this.name, model: this.model,
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - t0,
    }
  }
}
