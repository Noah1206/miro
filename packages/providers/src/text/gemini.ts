import type { AIInput, AIProvider } from './types'
import type { ProviderInfo } from '../types'

/**
 * Google Gemini (Generative Language API). 무료 등급이 있어 Closed Alpha 의 기본 Provider 다.
 * 키는 서버 환경변수에서만 읽는다 — 브라우저로 나가지 않는다.
 */
export class GeminiTextProvider implements AIProvider {
  readonly info: ProviderInfo

  constructor(private readonly apiKey: string, private readonly model = 'gemini-2.5-flash-lite') {
    this.info = { mode: 'live', name: `gemini/${model}`, notice: null }
  }

  async generateResponse({ system, prompt, maxTokens = 160 }: AIInput): Promise<string> {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens, temperature: 0.9,
          // 2.5 계열은 생각 토큰이 출력 한도를 먹는다 — 짧은 대사에는 끈다.
          ...(this.model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    })
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
  }
}
