import type { AIProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderInfo } from '../types'

/** Google Gemini (Generative Language API). 무료 등급이 있어 초기 기본 Provider. 키는 서버 env 에서만. */
export class GeminiProvider implements AIProvider {
  readonly info: ProviderInfo
  constructor(private readonly apiKey: string, private readonly model = 'gemini-2.5-flash-lite') {
    this.info = { mode: 'live', name: `gemini/${model}`, notice: null }
  }

  async healthCheck(): Promise<boolean> { try { return (await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}`, { headers: { 'x-goog-api-key': this.apiKey }, signal: AbortSignal.timeout(5000) })).ok } catch { return false } }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now()
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      signal: req.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 1024, temperature: req.temperature ?? 0.9,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
          // 2.5 계열은 생각 토큰이 출력 한도를 먹는다 — 대사 생성에는 끈다.
          ...(this.model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    })
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    return {
      text: (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim(),
      provider: 'gemini', model: this.model,
      inputTokens: body.usageMetadata?.promptTokenCount ?? null,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? null,
      latencyMs: Date.now() - t0,
    }
  }
}
