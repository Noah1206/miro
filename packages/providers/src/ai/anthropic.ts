import type { AIProvider, GenerationRequest, GenerationResult } from './types'
export class AnthropicProvider implements AIProvider {
  readonly info
  constructor(private readonly key: string, private readonly model: string) { this.info = { mode: 'live' as const, name: `anthropic/${model}`, notice: null } }
  private headers() { return { 'content-type': 'application/json', 'x-api-key': this.key, 'anthropic-version': '2023-06-01' } }
  async healthCheck(): Promise<boolean> { try { return (await fetch('https://api.anthropic.com/v1/models', { headers: this.headers(), signal: AbortSignal.timeout(5000) })).ok } catch { return false } }
  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const start = Date.now()
    const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: this.headers(), signal: req.signal,
      body: JSON.stringify({ model: this.model, max_tokens: req.maxTokens ?? 1024, system: req.system + (req.json ? '\nReturn only a JSON object.' : ''), messages: [{ role: 'user', content: req.prompt }], temperature: req.temperature ?? .7 }) })
    if (!response.ok) throw new Error('anthropic HTTP ' + response.status)
    const b = await response.json() as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
    return { text: (b.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join(''), provider: 'anthropic', model: this.model,
      inputTokens: b.usage?.input_tokens ?? null, outputTokens: b.usage?.output_tokens ?? null, latencyMs: Date.now()-start }
  }
}
