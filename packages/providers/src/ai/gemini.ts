import type { AIProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderInfo } from '../types'

/** Google Gemini (Generative Language API). 무료 등급이 있어 초기 기본 Provider. 키는 서버 env 에서만. */
export class GeminiProvider implements AIProvider {
  readonly info: ProviderInfo
  constructor(private readonly apiKey: string, private readonly model = 'gemini-3.5-flash-lite') {
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
        safetySettings: ['HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_HARASSMENT']
          .map(category => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' })),
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 1024, temperature: req.temperature ?? 0.9,
          ...(req.json ? { responseMimeType: 'application/json' } : {}),
          // 2.5 계열은 생각 토큰이 출력 한도를 먹는다 — 대사 생성에는 끈다.
          ...(this.model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          ...(this.model === 'gemini-3.5-flash-lite' ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
        },
      }),
    })
    if (!res.ok) { await res.body?.cancel(); throw new Error(`provider_http_${res.status}`) }
    const body = (await res.json()) as {
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
      promptFeedback?: { blockReason?: string }
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
    }
    return {
      blocked: !!body.promptFeedback?.blockReason && body.promptFeedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED'
        || ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION', 'IMAGE_SAFETY'].includes(body.candidates?.[0]?.finishReason ?? ''),
      text: (body.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map((p) => p.text ?? '').join('').trim(),
      provider: 'gemini', model: this.model,
      inputTokens: body.usageMetadata?.promptTokenCount ?? null,
      outputTokens: body.usageMetadata?.candidatesTokenCount == null ? null : body.usageMetadata.candidatesTokenCount + (body.usageMetadata.thoughtsTokenCount ?? 0),
      latencyMs: Date.now() - t0,
    }
  }
}
