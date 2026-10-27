import type { AIProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderInfo } from '../types'

/**
 * 모델별 생각 설정. 기본은 허용되는 최소값이고, 잘못 주면 400 이라 이름으로 가른다.
 * level 은 생각 수준을 받는 모델(3.8-flash·3.1-pro 등)에만 적용한다 — 실측(2026-09-29): 3.8-flash 는 low·medium·high 를 받고 low 는 생각 0.
 */
export function thinkingConfig(model: string, level?: 'low' | 'medium' | 'high'): { thinkingConfig?: Record<string, unknown> } {
  if (model === 'gemini-4-argon') return { thinkingConfig: { thinkingLevel: level ?? 'low' } }
  if (model.startsWith('gemini-2.5')) return { thinkingConfig: { thinkingBudget: 0 } }
  if (model === 'gemini-3.5-flash-lite') return { thinkingConfig: { thinkingLevel: 'minimal' } }
  if (model === 'gemini-3.5-flash') return { thinkingConfig: { thinkingBudget: 0 } }
  if (model.startsWith('gemini-3.')) return { thinkingConfig: { thinkingLevel: level ?? 'low' } }
  return {}
}

function samplingConfig(model: string, temperature?: number): { temperature?: number } {
  // Gemini 3 uses its sampling defaults; 3.6+ / 4 ignore overrides and will reject them.
  // https://ai.google.dev/gemini-api/docs/troubleshooting (2026-10-13)
  const major = Number(model.match(/^gemini-(\d+)(?:[.-]|$)/)?.[1])
  return major >= 3 ? {} : { temperature: temperature ?? 0.9 }
}

/** Google Gemini (Generative Language API). 무료 등급이 있어 초기 기본 Provider. 키는 서버 env 에서만. */
export class GeminiProvider implements AIProvider {
  readonly info: ProviderInfo
  constructor(private readonly apiKey: string, private readonly model = 'gemini-3.5-flash-lite') {
    this.info = { mode: 'live', name: `gemini/${model}`, notice: null }
  }

  async healthCheck(): Promise<boolean> { try { return (await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}`, { headers: { 'x-goog-api-key': this.apiKey }, signal: AbortSignal.timeout(5000) })).ok } catch { return false } }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now()
    // 화면에 보낼 곳이 있으면 만드는 대로 받는다(10/17 — 대사 전체를 기다리던 몇 초가 첫 글자까지의 시간이었다). 나머지는 한 번에.
    const streaming = !!req.onText
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      signal: req.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        safetySettings: ['HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT', 'HARM_CATEGORY_HARASSMENT']
          .map(category => ({ category, threshold: req.safety === 'relaxed' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_MEDIUM_AND_ABOVE' })),
        generationConfig: {
          maxOutputTokens: req.maxTokens ?? 1024,
          ...samplingConfig(this.model, req.temperature),
          ...(req.json ? { responseMimeType: 'application/json', ...(req.responseSchema ? { responseJsonSchema: req.responseSchema } : {}) } : {}),
          // 생각 토큰은 출력 단가로 과금되고 maxOutputTokens 를 같이 먹는다 — 대사 생성에는 최소로.
          // 모델마다 받는 값이 다르다 (2026-09 실측): 3.5-flash-lite 는 minimal 만, 3.5-flash 는 budget 0 만,
          // 3.8-flash 는 low 로 0 이 되고, 3.1-pro 는 끌 수 없어 low 가 최선(≈630 토큰).
          ...thinkingConfig(this.model, req.thinking),
        },
      }),
    })
    if (!res.ok) { await res.body?.cancel(); throw new Error(`provider_http_${res.status}`) }
    const chunks: GeminiResponse[] = streaming ? [] : [(await res.json()) as GeminiResponse]
    if (streaming) {
      // SSE: 줄마다 "data: {...}" 하나가 응답 조각이다. 글은 조각마다 이어 붙인 전체를 넘긴다(onText 계약).
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = '', text = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (value) buffer += value
        const lines = buffer.split('\n')
        buffer = done ? '' : lines.pop()!
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const chunk = JSON.parse(line.slice(5)) as GeminiResponse
          chunks.push(chunk)
          const delta = visibleText(chunk)
          if (delta) { text += delta; req.onText!(text) }
        }
        if (done) break
      }
    }
    const last = chunks.at(-1)
    const finishReason = [...chunks].reverse().find(c => c.candidates?.[0]?.finishReason)?.candidates?.[0]?.finishReason ?? ''
    const blockReason = chunks.find(c => c.promptFeedback?.blockReason)?.promptFeedback?.blockReason
    const usage = [...chunks].reverse().find(c => c.usageMetadata)?.usageMetadata
    return {
      blocked: !!blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED'
        || ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION', 'IMAGE_SAFETY'].includes(finishReason),
      text: chunks.map(visibleText).join('').trim(),
      provider: 'gemini', model: [...chunks].reverse().find(c => c.modelVersion)?.modelVersion ?? this.model,
      inputTokens: usage?.promptTokenCount ?? null,
      cachedInputTokens: usage?.cachedContentTokenCount,
      outputTokens: usage?.candidatesTokenCount == null ? null : usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0),
      latencyMs: Date.now() - t0,
      truncated: finishReason === 'MAX_TOKENS' || (!!last && !finishReason && streaming),
    }
  }
}

type GeminiResponse = {
  modelVersion?: string
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>
  promptFeedback?: { blockReason?: string }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number }
}
const visibleText = (r: GeminiResponse) => (r.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('')
