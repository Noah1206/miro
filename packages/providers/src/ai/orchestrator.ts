import { randomUUID } from 'node:crypto'
import { productionRuntime } from '@miro/config'
import type { ZodType, ZodTypeDef } from 'zod'
import type { LLMProvider, ProviderInfo } from '../types'
import type { AIContext, AIProvider, AIUsageRecord, BudgetGuard, GenerationRequest, GenerationResult } from './types'
import { AIContentBlockedError } from './types'
import { AI_TASKS, interactionImportance, taskOf } from './tasks'
import { ModelRegistry, modelCost, routeModels, type ModelDefinition, type RolloutPolicy } from './model-registry'

export class AIUnavailableError extends Error {
  constructor(public readonly attempts: number, public readonly last: string) { super(`ai unavailable after ${attempts} attempts: ${last}`) }
}
export class AIBudgetDeniedError extends Error {
  constructor(readonly reason: string) { super('AI budget denied: ' + reason) }
}
export type OrchestratorOptions = {
  chain: AIProvider[]; registry?: ModelRegistry; resolveModel?: (m: ModelDefinition) => AIProvider
  timeoutMs?: number; maxRetries?: number; rateLimitBackoffMs?: number; onUsage?: (r: AIUsageRecord) => void | Promise<void>
  explicitModel?: ModelDefinition
  shadow?: { model: ModelDefinition; provider: AIProvider }
  context?: AIContext; budgetGuard?: BudgetGuard; rollout?: RolloutPolicy
}

/** One entry point for every task. No provider data can reach Core before runtime validation. */
export class AIOrchestrator implements LLMProvider {
  readonly info: ProviderInfo
  readonly traceId: string
  readonly requestId: string
  shadowOutput: unknown = null
  lastModelId: string | null = null
  lastPromptVersion: string | null = null
  lastFallbackUsed = false
  private readonly timeoutMs: number
  private readonly maxRetries: number
  /** 429 재시도 전 대기(ms). 테스트에서 0 으로 줄일 수 있게 주입 가능하다. */
  private readonly rateLimitBackoffMs: number
  constructor(private readonly opts: OrchestratorOptions) {
    if (!opts.chain.length) throw new Error('AI chain is empty')
    this.timeoutMs = Math.max(1, Math.min(60_000, opts.timeoutMs ?? 20_000))
    this.maxRetries = Math.min(1, Math.max(0, opts.maxRetries ?? 1))
    this.rateLimitBackoffMs = Math.max(0, opts.rateLimitBackoffMs ?? 1000)
    this.traceId = opts.context?.traceId ?? randomUUID()
    this.requestId = opts.context?.requestId ?? randomUUID()
    this.info = { ...opts.chain[0]!.info }
  }
  async execute<Out, In = Out>(opts: GenerationRequest & { schema: ZodType<Out, ZodTypeDef, In>; maxRetries?: number }): Promise<Out> {
    const production = this.run({ ...opts, task: taskOf(opts.task), json: true }, text => {
      const parsed = opts.schema.safeParse(extractJson(text))
      if (!parsed.success) throw new Error('invalid_schema')
      return parsed.data
    }, opts.maxRetries)
    const shadow = this.opts.shadow
    if (shadow && shadow.model.capabilities.includes(taskOf(opts.task)) && this.opts.context?.allowEvaluation) {
      const ai = new AIOrchestrator({ chain: [shadow.provider], explicitModel: shadow.model,
        context: { ...this.opts.context, traceId: this.traceId, requestId: this.requestId, usageUnits: 0, shadow: true }, budgetGuard: this.opts.budgetGuard,
        onUsage: this.opts.onUsage, maxRetries: 0, timeoutMs: Math.min(2000, this.timeoutMs) })
      const comparison = ai.execute(opts).then(result => { this.shadowOutput = result }, () => {})
      const [result] = await Promise.all([production, comparison])
      return result
    }
    return production
  }
  async generateStructured<Out, In = Out>(opts: {
    schema: ZodType<Out, ZodTypeDef, In>; system: string; prompt: string; maxRetries?: number
    task?: string; maxTokens?: number; promptVersion?: string; importance?: GenerationRequest['importance']
  }): Promise<Out> { return this.execute({ ...opts, task: taskOf(opts.task) }) }
  async generateText(opts: { system: string; prompt: string; task?: string; maxTokens?: number; temperature?: number; promptVersion?: string }): Promise<string> {
    return this.run({ ...opts, task: taskOf(opts.task) }, text => {
      if (!text.trim()) throw new Error('empty_output')
      return text.trim()
    })
  }
  private selections(req: GenerationRequest): Array<{ model: ModelDefinition; provider: AIProvider }> {
    if (this.opts.explicitModel) return [{ model: this.opts.explicitModel, provider: this.opts.chain[0]! }]
    if (this.opts.registry && this.opts.resolveModel) {
      if (req.task === 'dialogue' && this.opts.context?.dialogueModelId) {
        const model = this.opts.registry.get(this.opts.context.dialogueModelId)
        if (!model.capabilities.includes('dialogue') || model.maxContextTokens < Math.ceil(Buffer.byteLength(req.system + req.prompt, 'utf8')) + model.maxOutputTokens) throw new Error('selected model cannot handle dialogue context')
        return [{ model, provider: this.opts.resolveModel(model) }]
      }
      const models = routeModels(this.opts.registry, taskOf(req.task), req.importance ?? interactionImportance(req.prompt),
        Math.ceil(Buffer.byteLength(req.system + req.prompt, 'utf8')), this.opts.context?.userId ?? this.traceId, this.opts.rollout, this.opts.context?.continuity)
      return models.map(model => ({ model, provider: this.opts.resolveModel!(model) }))
    }
    return this.opts.chain.map((provider, i) => ({ provider, model: {
      id: `legacy-${i}`, provider: provider.info.mode === 'mock' ? 'mock' : 'openai', providerModelId: provider.info.name,
      tier: 'standard', capabilities: [...AI_TASKS], enabled: true, version: 'legacy', maxContextTokens: 32768, maxOutputTokens: 1024, trainingAllowed: false,
    } }))
  }
  private async run<T>(req: GenerationRequest, validate: (text: string) => T, overrideRetries?: number): Promise<T> {
    let attempts = 0, last = 'unavailable', denied: string | null = null
    const selections = this.selections(req)
    for (let index = 0; index < selections.length; index++) {
      const { provider, model } = selections[index]!
      if (productionRuntime() && (provider.info.mode === 'mock' || !this.opts.budgetGuard)) {
        throw new AIBudgetDeniedError('production_guard_required')
      }
      for (let retry = 0; retry <= Math.min(this.maxRetries, overrideRetries ?? this.maxRetries); retry++) {
        // 속도 제한은 곧바로 다시 걸린다 — 재시도 전에 잠깐 기다린다.
        // 스키마 오류처럼 즉시 고쳐지는 실패에는 기다리지 않는다.
        if (retry > 0 && last === 'provider_http_429') await new Promise(r => setTimeout(r, this.rateLimitBackoffMs))
        const attemptId = randomUUID()
        const request = { ...req, maxTokens: Math.min(req.maxTokens ?? model.maxOutputTokens, model.maxOutputTokens),
          prompt: retry ? req.prompt + '\nReturn only valid JSON matching the requested schema.' : req.prompt }
        const context = { ...this.opts.context, traceId: this.traceId, requestId: this.requestId }
        if (this.opts.budgetGuard) {
          const decision = await this.opts.budgetGuard.authorize(request, model, context, attemptId)
          if (!decision.allowed) { denied = decision.reason; break }
        }
        attempts++
        const started = Date.now(), controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        let result: GenerationResult | undefined, output: T | undefined, ok = false
        try {
          result = await Promise.race([
            provider.generate({ ...request, signal: controller.signal }),
            new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(`timeout ${this.timeoutMs}ms`)) }, this.timeoutMs) }),
          ])
          if (result.blocked) throw new AIContentBlockedError()
          output = validate(result.text)
          ok = true
        } catch (e) {
          // Never log provider response bodies, keys, prompts or private reasoning.
          const message = e instanceof Error ? e.message : ''
          last = e instanceof AIContentBlockedError ? 'content_blocked' : controller.signal.aborted ? `timeout ${this.timeoutMs}ms` : message === 'invalid_schema' || message === 'empty_output' || /^provider_http_[45]\d\d$/.test(message) ? message : 'provider_error'
        } finally { clearTimeout(timer) }
        const input = result?.inputTokens ?? null, out = result?.outputTokens ?? null
        await this.opts.onUsage?.({ task: req.task, traceId: this.traceId, requestId: this.requestId, attemptId,
          userId: context.userId ?? null, sessionId: context.sessionId ?? null, ip: context.ip ?? null,
          provider: result?.provider ?? model.provider, model: result?.model ?? model.providerModelId,
          modelId: model.id, modelVersion: model.version, promptVersion: req.promptVersion ?? `${req.task}:v1`,
          inputTokens: input, outputTokens: out, estimatedCost: modelCost(model, input, out), actualCost: null,
          usageUnits: ok ? context.usageUnits ?? 0 : 0, latencyMs: Date.now() - started, ok, error: ok ? null : last, fallbackUsed: index > 0, shadow: context.shadow ?? false,
        })
        if (result?.blocked) throw new AIContentBlockedError()
        if (ok) {
          this.info.mode = provider.info.mode
          this.lastModelId = model.id; this.lastPromptVersion = req.promptVersion ?? `${req.task}:v1`; this.lastFallbackUsed = index > 0
          return output as T
        }
      }
    }
    if (attempts === 0 && denied) throw new AIBudgetDeniedError(denied)
    throw new AIUnavailableError(attempts, last)
  }
}
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  try { return JSON.parse(trimmed) } catch { /* tolerate surrounding prose, still validate the entire result */ }
  const start = trimmed.indexOf('{'), end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { return null }
}
