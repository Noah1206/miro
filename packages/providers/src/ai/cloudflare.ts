import type { AIProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderInfo } from '../types'

/** Cloudflare Workers AI. 무료 할당량이 있는 fallback 후보. */
export class CloudflareProvider implements AIProvider {
  readonly info: ProviderInfo
  constructor(private readonly accountId: string, private readonly token: string, private readonly model = '@cf/meta/llama-3.1-8b-instruct') {
    this.info = { mode: 'live', name: `cloudflare/${model}`, notice: null }
  }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now()
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      signal: req.signal,
      body: JSON.stringify({
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.prompt }],
        max_tokens: req.maxTokens ?? 1024, temperature: req.temperature ?? 0.9,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok) throw new Error(`cloudflare ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const body = (await res.json()) as { result?: { response?: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } }
    return {
      text: (body.result?.response ?? '').trim(),
      provider: 'cloudflare', model: this.model,
      inputTokens: body.result?.usage?.prompt_tokens ?? null,
      outputTokens: body.result?.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - t0,
    }
  }
}
