import type { AIProvider, GenerationRequest, GenerationResult } from './types'
import type { ProviderInfo } from '../types'

/**
 * OpenAI 호환 chat/completions — OpenAI(강한 일의 예비 GPT-5.4 mini), Vercel AI Gateway(모델은 "provider/model"), 로컬 서버(Ollama 등).
 * 실패는 Gemini 와 같은 모양(provider_http_<상태>)으로 던진다 — 오케스트레이터의 재시도·429 대기·예비 전환이 공급자와 무관하게 돈다(10/2).
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly info: ProviderInfo
  constructor(
    private readonly name: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    /** 공급자별 추가 본문(OpenRouter 의 provider 라우팅 등). */
    private readonly extra: Record<string, unknown> = {},
  ) {
    this.info = { mode: 'live', name: `${name}/${model}`, notice: null }
  }

  async healthCheck(): Promise<boolean> { try { return (await fetch(`${this.baseUrl}/models`, { headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(5000) })).ok } catch { return false } }

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const t0 = Date.now()
    // GPT-5 계열은 max_tokens·temperature 를 받지 않는다(400). 생각은 reasoning_effort 로 — 없으면 none(생각 0, 대사 생성용).
    const gpt5 = /^(openai\/)?gpt-5/.test(this.model)
    // GPT-5 는 생각 토큰이 max_completion_tokens 를 같이 먹는다 — medium 생각이면 4096 을 생각만으로 다 써 답이 비었다
    // (10/4 성격표 예비 호출 전부 max_tokens). 생각을 켠 요청은 답 몫의 3배를 준다. ponytail: 모델 상한은 레지스트리가 알지만 여기선 모른다 — 16k 안이면 된다.
    const completionCap = (req.maxTokens ?? 1024) * (req.thinking ? 3 : 1)
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      signal: req.signal,
      body: JSON.stringify({
        model: this.model,
        // JSON 모드는 지시문에 JSON 이라는 말이 있어야 받는다(없으면 400).
        messages: [{ role: 'system', content: req.system + (req.json ? '\nReturn only a JSON object.' : '') }, { role: 'user', content: req.prompt }],
        ...(gpt5 ? { max_completion_tokens: completionCap, reasoning_effort: req.thinking ?? 'none' }
          : { max_tokens: req.maxTokens ?? 1024, temperature: req.temperature ?? 0.9 }),
        // OpenRouter 도 생각은 reasoning 으로 — 없으면 none. 생각 토큰도 max_tokens 를 먹는다(10/2 성인 모드 실측: Kimi·Seed 가 생각하다 2048 을 다 써 대사가 잘렸다).
        // ponytail: 생각을 끌 수 없는 모델(필수 생각)은 none 을 무시한다 — 그런 모델은 비교에서 거른다.
        ...(this.name === 'openrouter' ? { reasoning: { effort: req.thinking ?? 'none', exclude: true } } : {}),
        // 스키마는 디코딩 안내로만 준다(strict 아님) — strict 는 선택 필드가 있는 우리 스키마를 400 으로 거절한다. 검증은 오케스트레이터가 zod 로 한다.
        // ponytail: 예비가 스키마를 자주 어기면 선택 필드를 nullable 로 바꾼 strict 스키마로 올린다.
        ...(req.json ? { response_format: req.responseSchema
          ? { type: 'json_schema', json_schema: { name: 'output', schema: req.responseSchema, strict: false } }
          : { type: 'json_object' } } : {}),
        ...this.extra,
      }),
    })
    if (!res.ok) { await res.body?.cancel(); throw new Error(`provider_http_${res.status}`) }
    const body = (await res.json()) as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = body.choices?.[0]
    return {
      // 공급자 필터·거절은 Gemini 의 차단과 같게 — 다른 모델로 돌려 피하지 않는다.
      blocked: choice?.finish_reason === 'content_filter' || !!choice?.message?.refusal,
      text: (choice?.message?.content ?? '').trim(),
      provider: this.name, model: this.model,
      inputTokens: body.usage?.prompt_tokens ?? null,
      outputTokens: body.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - t0,
      truncated: choice?.finish_reason === undefined ? undefined : choice.finish_reason === 'length',
    }
  }
}
