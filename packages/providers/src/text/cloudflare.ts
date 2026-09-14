import type { AIInput, AIProvider } from './types'
import type { ProviderInfo } from '../types'

/** Cloudflare Workers AI. 무료 할당량이 있는 두 번째 선택지. */
export class CloudflareTextProvider implements AIProvider {
  readonly info: ProviderInfo

  constructor(
    private readonly accountId: string,
    private readonly token: string,
    private readonly model = '@cf/meta/llama-3.1-8b-instruct',
  ) {
    this.info = { mode: 'live', name: `cloudflare/${model}`, notice: null }
  }

  async generateResponse({ system, prompt, maxTokens = 160 }: AIInput): Promise<string> {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], max_tokens: maxTokens }),
    })
    if (!res.ok) throw new Error(`cloudflare ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const body = (await res.json()) as { result?: { response?: string } }
    return (body.result?.response ?? '').trim()
  }
}
