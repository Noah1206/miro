import type { ZodType, ZodTypeDef } from 'zod'
import type { LLMProvider, ProviderInfo } from '../types'
import type { AIContext, AIProvider, AIUsageRecord, GenerationRequest } from './types'

/** 모든 Provider 가 실패했다. 호출자는 이걸 사용자에게 보이는 정상 문장으로 바꾼다 — 스택은 절대 밖으로 안 나간다. */
export class AIUnavailableError extends Error {
  constructor(public readonly attempts: number, public readonly last: string) {
    super(`ai unavailable after ${attempts} attempts: ${last}`)
  }
}

export type OrchestratorOptions = {
  /** 앞이 primary, 뒤가 fallback. 비어 있으면 안 된다. */
  chain: AIProvider[]
  timeoutMs?: number
  /** Provider 하나당 재시도 횟수 (스키마 위반·전송 실패 모두). 무한 재시도 금지. */
  maxRetries?: number
  /** Usage Manager. 없으면 기록하지 않는다. */
  onUsage?: (r: AIUsageRecord) => void | Promise<void>
  context?: AIContext
}

/**
 * AI Orchestrator — Miro 에서 모델을 부르는 유일한 문.
 * Provider 선택(체인) → 타임아웃 → 재시도 → fallback → 사용량 기록 → 응답 검증.
 * 기존 엔진이 쓰는 LLMProvider(generateStructured) 계약을 그대로 만족한다.
 */
export class AIOrchestrator implements LLMProvider {
  readonly info: ProviderInfo
  private readonly chain: AIProvider[]
  private readonly timeoutMs: number
  private readonly maxRetries: number

  constructor(private readonly opts: OrchestratorOptions) {
    if (opts.chain.length === 0) throw new Error('AI chain is empty')
    this.chain = opts.chain
    this.timeoutMs = opts.timeoutMs ?? 20_000
    this.maxRetries = opts.maxRetries ?? 1
    const primary = this.chain[0]!
    this.info = {
      mode: primary.info.mode,
      name: this.chain.map((p) => p.info.name).join(' → '),
      notice: primary.info.notice,
    }
  }

  /** 구조화 생성 — JSON 만 받아 스키마로 검증한다. 위반하면 이유를 붙여 재요청, 그래도 안 되면 다음 Provider. */
  async generateStructured<Out, In = Out>(opts: {
    schema: ZodType<Out, ZodTypeDef, In>
    system: string
    prompt: string
    maxRetries?: number
    task?: string
    maxTokens?: number
  }): Promise<Out> {
    const retries = opts.maxRetries ?? this.maxRetries
    let attempts = 0
    let lastError = ''
    for (const provider of this.chain) {
      let prompt = opts.prompt
      for (let attempt = 0; attempt <= retries; attempt++) {
        attempts += 1
        const res = await this.call(provider, { task: opts.task ?? 'structured', system: opts.system, prompt, json: true, maxTokens: opts.maxTokens, temperature: 0.7 })
        if (!res.ok) { lastError = res.error; continue }
        const json = extractJson(res.text)
        if (json === null) { lastError = 'JSON 파싱 실패'; prompt = `${opts.prompt}\n\n이전 출력이 JSON 이 아니었습니다. 올바른 JSON 객체만 반환하세요.`; continue }
        const parsed = opts.schema.safeParse(json)
        if (parsed.success) return parsed.data
        lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        prompt = `${opts.prompt}\n\n이전 출력이 스키마를 위반했습니다: ${lastError}\n올바른 JSON 만 반환하세요.`
      }
    }
    throw new AIUnavailableError(attempts, lastError)
  }

  /** 자유 텍스트 한 마디. 빈 답은 실패로 본다. */
  async generateText(opts: { system: string; prompt: string; task?: string; maxTokens?: number; temperature?: number }): Promise<string> {
    let attempts = 0
    let lastError = ''
    for (const provider of this.chain) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        attempts += 1
        const res = await this.call(provider, { task: opts.task ?? 'text', system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens ?? 256, temperature: opts.temperature })
        if (res.ok && res.text.trim()) return res.text.trim()
        lastError = res.ok ? 'empty' : res.error
      }
    }
    throw new AIUnavailableError(attempts, lastError)
  }

  /** 한 번의 호출: 타임아웃을 걸고, 성공·실패 모두 사용량으로 남긴다. */
  private async call(provider: AIProvider, req: GenerationRequest): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const t0 = Date.now()
    try {
      const r = await provider.generate({ ...req, signal: controller.signal })
      await this.record({ task: req.task, provider: r.provider, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: r.latencyMs, ok: true, error: null })
      return { ok: true, text: r.text }
    } catch (e) {
      const error = controller.signal.aborted ? `timeout ${this.timeoutMs}ms` : (e as Error).message.slice(0, 200)
      await this.record({ task: req.task, provider: provider.info.name, model: provider.info.name, inputTokens: null, outputTokens: null, latencyMs: Date.now() - t0, ok: false, error })
      return { ok: false, error }
    } finally {
      clearTimeout(timer)
    }
  }

  private async record(r: Omit<AIUsageRecord, 'userId' | 'sessionId'>): Promise<void> {
    try {
      await this.opts.onUsage?.({ ...r, userId: this.opts.context?.userId ?? null, sessionId: this.opts.context?.sessionId ?? null })
    } catch { /* 기록 실패가 생성을 막으면 안 된다 */ }
  }
}

/** 모델이 코드 펜스나 설명을 덧붙여도 JSON 본문만 건져낸다. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try { return JSON.parse(trimmed) } catch { /* 아래에서 중괄호 범위로 재시도 */ }
  const start = trimmed.indexOf('{'), end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { return null }
}
