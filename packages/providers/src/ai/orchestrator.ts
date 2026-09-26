import { randomUUID } from 'node:crypto'
import { productionRuntime } from '@miro/config'
import type { ZodType, ZodTypeDef } from 'zod'
import type { LLMProvider, ProviderInfo } from '../types'
import type { AIContext, AILeaseGuard, AIProvider, AIUsageRecord, BudgetGuard, GenerationRequest, GenerationResult } from './types'
import { AIContentBlockedError } from './types'
import { AI_TASKS, interactionImportance, taskOf } from './tasks'
import { ModelRegistry, modelCost, routeModels, type ModelDefinition, type RolloutPolicy } from './model-registry'

export class AIUnavailableError extends Error {
  constructor(public readonly attempts: number, public readonly last: string) { super(`ai unavailable after ${attempts} attempts: ${last}`) }
}
export class AIBudgetDeniedError extends Error {
  constructor(readonly reason: string) { super('AI budget denied: ' + reason) }
}
type ProviderLoad = { active: number; background: number; retryAfter: number }
const providerLoad = new Map<string, ProviderLoad>()

function providerConcurrency(): number {
  const limit = Number(process.env.MIRO_AI_PROVIDER_CONCURRENCY ?? 4)
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid AI provider concurrency')
  return limit
}

function acquireProvider(key: string, background: boolean): (() => void) | null {
  const limit = providerConcurrency()
  const load = providerLoad.get(key) ?? { active: 0, background: 0, retryAfter: 0 }
  providerLoad.set(key, load)
  if (Date.now() < load.retryAfter || load.active >= limit || (background && (load.background >= 1 || load.active >= limit - 1))) return null
  load.active++
  if (background) load.background++
  return () => { load.active--; if (background) load.background-- }
}

function rateLimitProvider(key: string, backoffMs: number): void {
  const load = providerLoad.get(key)
  if (load) load.retryAfter = Math.max(load.retryAfter, Date.now() + backoffMs)
}
export type OrchestratorOptions = {
  chain: AIProvider[]; registry?: ModelRegistry; resolveModel?: (m: ModelDefinition) => AIProvider
  timeoutMs?: number; maxRetries?: number; rateLimitBackoffMs?: number; onUsage?: (r: AIUsageRecord) => void | Promise<void>
  leaseHeartbeatMs?: number; maxLeaseHoldMs?: number
  explicitModel?: ModelDefinition
  shadow?: { model: ModelDefinition; provider: AIProvider }
  context?: AIContext; budgetGuard?: BudgetGuard; leaseGuard?: AILeaseGuard; rollout?: RolloutPolicy
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
  private readonly maxLeaseHoldMs: number
  private readonly maxRetries: number
  /** 429 재시도 전 대기(ms). 테스트에서 0 으로 줄일 수 있게 주입 가능하다. */
  private readonly rateLimitBackoffMs: number
  constructor(private readonly opts: OrchestratorOptions) {
    if (!opts.chain.length) throw new Error('AI chain is empty')
    this.timeoutMs = Math.max(1, Math.min(60_000, opts.timeoutMs ?? 20_000))
    this.maxLeaseHoldMs = Math.max(this.timeoutMs + 1, Math.min(300_000, opts.maxLeaseHoldMs ?? 300_000))
    this.maxRetries = Math.min(1, Math.max(0, opts.maxRetries ?? 1))
    this.rateLimitBackoffMs = Math.max(0, opts.rateLimitBackoffMs ?? 1000)
    this.traceId = opts.context?.traceId ?? randomUUID()
    this.requestId = opts.context?.requestId ?? randomUUID()
    this.info = { ...opts.chain[0]!.info }
  }
  async execute<Out, In = Out>(opts: GenerationRequest & { schema: ZodType<Out, ZodTypeDef, In>; maxRetries?: number }): Promise<Out> {
    const production = this.run({ ...opts, task: taskOf(opts.task), json: true }, text => {
      const parsed = opts.schema.safeParse(extractJson(text))
      // Schema paths and issue codes only, never output text: enough to see which field a model keeps breaking.
      if (!parsed.success) throw new Error(`invalid_schema ${parsed.error.issues.slice(0, 4).map(i => `${i.path.join('.') || '$'}:${i.code}`).join(' ')}`)
      return parsed.data
    }, opts.maxRetries)
    const shadow = this.opts.shadow
    if (shadow && shadow.model.capabilities.includes(taskOf(opts.task)) && this.opts.context?.allowEvaluation) {
      const ai = new AIOrchestrator({ chain: [shadow.provider], explicitModel: shadow.model,
        context: { ...this.opts.context, traceId: this.traceId, requestId: this.requestId, usageUnits: 0, shadow: true }, budgetGuard: this.opts.budgetGuard, leaseGuard: this.opts.leaseGuard,
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
    responseSchema?: GenerationRequest['responseSchema']
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
    if (req.signal?.aborted) throw new AIUnavailableError(0, 'cancelled')
    let attempts = 0, last = 'unavailable', denied: string | null = null
    const selections = this.selections(req)
    for (let index = 0; index < selections.length; index++) {
      const { provider, model } = selections[index]!
      const providerKey = this.opts.registry || this.opts.explicitModel ? model.provider : provider.info.name.split('/')[0]!
      if (productionRuntime() && (provider.info.mode === 'mock' || !this.opts.budgetGuard
        || (process.env.MIRO_AI_DB_LEASES === '1' && !this.opts.leaseGuard))) {
        throw new AIBudgetDeniedError('production_guard_required')
      }
      for (let retry = 0; retry <= Math.min(this.maxRetries, overrideRetries ?? this.maxRetries); retry++) {
        // 속도 제한은 곧바로 다시 걸린다 — 재시도 전에 잠깐 기다린다.
        // 스키마 오류처럼 즉시 고쳐지는 실패에는 기다리지 않는다.
        // 타이머는 Date.now() 기준으로 1ms 일찍 깰 수 있다(실측 약 3.5%). 그러면 아래 입장 게이트(retryAfter)에
        // 자기 백오프로 막혀 재시도가 조용히 빠진다 — 게이트를 실제로 지날 때까지 남은 만큼 더 기다린다.
        if (retry > 0 && last === 'provider_http_429') {
          for (let wait = Math.max(this.rateLimitBackoffMs, (providerLoad.get(providerKey)?.retryAfter ?? 0) - Date.now()); wait > 0;
            wait = (providerLoad.get(providerKey)?.retryAfter ?? 0) - Date.now()) await new Promise(r => setTimeout(r, wait))
        }
        const attemptId = randomUUID()
        const request = { ...req, maxTokens: Math.min(req.maxTokens ?? model.maxOutputTokens, model.maxOutputTokens),
          prompt: retry ? req.prompt + '\nReturn only valid JSON matching the requested schema.' : req.prompt }
        const context = { ...this.opts.context, traceId: this.traceId, requestId: this.requestId }
        const release = acquireProvider(providerKey, context.workload === 'background')
        if (!release) { last = 'provider_overloaded'; break }
        let lease: Awaited<ReturnType<AILeaseGuard['acquire']>> = null
        try {
          lease = await this.opts.leaseGuard?.acquire(providerKey, context.workload === 'background' ? 'background' : 'interactive') ?? null
        } catch {
          release()
          throw new AIUnavailableError(attempts, 'lease_store_unavailable')
        }
        if (this.opts.leaseGuard && !lease) { release(); last = 'provider_overloaded'; break }
        let admissionReleased = false
        const releaseAdmission = async () => {
          if (admissionReleased) return
          admissionReleased = true
          release()
          await lease?.release()
        }
        if (req.signal?.aborted) { await releaseAdmission(); throw new AIUnavailableError(attempts, 'cancelled') }
        if (this.opts.budgetGuard) {
          try {
            const decision = await this.opts.budgetGuard.authorize(request, model, context, attemptId)
            if (!decision.allowed) { await releaseAdmission(); denied = decision.reason; break }
          } catch (error) { await releaseAdmission(); throw error }
        }
        if (lease) {
          let valid = false
          try { valid = await lease.heartbeat() } catch {}
          if (!valid) {
            await releaseAdmission().catch(() => {})
            await this.opts.onUsage?.({ task: req.task, traceId: this.traceId, requestId: this.requestId, attemptId,
              userId: context.userId ?? null, sessionId: context.sessionId ?? null, ip: context.ip ?? null,
              provider: model.provider, model: model.providerModelId, modelId: model.id, modelVersion: model.version,
              promptVersion: req.promptVersion ?? `${req.task}:v1`, inputTokens: null, outputTokens: null,
              estimatedCost: 0, actualCost: 0, usageUnits: 0, latencyMs: 0, ok: false, error: 'lease_lost_before_call',
              fallbackUsed: index > 0, shadow: context.shadow ?? false })
            throw new AIUnavailableError(attempts, 'lease_lost')
          }
        }
        attempts++
        const started = Date.now(), controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        let cancel: (() => void) | undefined
        let heartbeatTimer: ReturnType<typeof setInterval> | undefined
        let heartbeatTimeout: ReturnType<typeof setTimeout> | undefined
        let maxHoldTimer: ReturnType<typeof setTimeout> | undefined
        let rejectLeaseLoss: ((reason: Error) => void) | undefined
        let rejectHoldExpiry: ((reason: Error) => void) | undefined
        let settled = false, leaseLost = false, holdExpired = false, renewing = false
        const leaseFailure = new Promise<never>((_, reject) => { rejectLeaseLoss = reject })
        const holdFailure = new Promise<never>((_, reject) => { rejectHoldExpiry = reject })
        const loseLease = () => {
          if (settled || leaseLost || holdExpired) return
          leaseLost = true
          controller.abort()
          rejectLeaseLoss?.(new Error('lease_lost'))
        }
        if (lease) heartbeatTimer = setInterval(() => {
          if (renewing || leaseLost || settled) return
          renewing = true
          heartbeatTimeout = setTimeout(loseLease, 5000)
          void lease.heartbeat().then(valid => {
            clearTimeout(heartbeatTimeout); renewing = false
            if (!valid) loseLease()
          }, () => {
            clearTimeout(heartbeatTimeout); renewing = false; loseLease()
          })
        }, this.opts.leaseHeartbeatMs ?? 10_000)
        maxHoldTimer = setTimeout(() => {
          if (settled || holdExpired) return
          holdExpired = true
          controller.abort()
          clearInterval(heartbeatTimer); clearTimeout(heartbeatTimeout)
          void releaseAdmission().catch(() => {})
          rejectHoldExpiry?.(new Error('lease_hold_expired'))
        }, this.maxLeaseHoldMs)
        let result: GenerationResult | undefined, output: T | undefined, ok = false
        try {
          const generation = Promise.resolve().then(() => provider.generate({ ...request, signal: controller.signal }))
          const finish = () => {
            settled = true
            clearInterval(heartbeatTimer); clearTimeout(heartbeatTimeout); clearTimeout(maxHoldTimer)
            void releaseAdmission().catch(() => {})
          }
          void generation.then(finish, finish)
          const cancelled = new Promise<never>((_, reject) => {
            cancel = () => { controller.abort(); reject(new Error('cancelled')) }
            req.signal?.addEventListener('abort', cancel, { once: true })
            if (req.signal?.aborted) cancel()
          })
          result = await Promise.race([
            generation,
            cancelled,
            leaseFailure,
            holdFailure,
            new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(`timeout ${this.timeoutMs}ms`)) }, this.timeoutMs) }),
          ])
          if (leaseLost) throw new Error('lease_lost')
          if (holdExpired) throw new Error('lease_hold_expired')
          if (result.blocked) throw new AIContentBlockedError()
          output = validate(result.text)
          ok = true
        } catch (e) {
          // Never log provider response bodies, keys, prompts or private reasoning.
          const message = e instanceof Error ? e.message : ''
          last = e instanceof AIContentBlockedError ? 'content_blocked' : req.signal?.aborted ? 'cancelled' : leaseLost ? 'lease_lost' : holdExpired ? 'lease_hold_expired' : controller.signal.aborted ? `timeout ${this.timeoutMs}ms` : result?.truncated && message.startsWith('invalid_schema') ? 'max_tokens' : message.startsWith('invalid_schema') || message === 'empty_output' || /^provider_http_[45]\d\d$/.test(message) ? message : 'provider_error'
          if (last === 'provider_http_429') rateLimitProvider(providerKey, this.rateLimitBackoffMs)
        } finally { clearTimeout(timer); if (cancel) req.signal?.removeEventListener('abort', cancel) }
        const input = result?.inputTokens ?? null, out = result?.outputTokens ?? null
        await this.opts.onUsage?.({ task: req.task, traceId: this.traceId, requestId: this.requestId, attemptId,
          userId: context.userId ?? null, sessionId: context.sessionId ?? null, ip: context.ip ?? null,
          provider: result?.provider ?? model.provider, model: result?.model ?? model.providerModelId,
          modelId: model.id, modelVersion: model.version, promptVersion: req.promptVersion ?? `${req.task}:v1`,
          inputTokens: input, outputTokens: out, estimatedCost: modelCost(model, input, out), actualCost: null,
          usageUnits: ok ? context.usageUnits ?? 0 : 0, latencyMs: Date.now() - started, ok, error: ok ? null : last, fallbackUsed: index > 0, shadow: context.shadow ?? false,
        })
        if (result?.blocked) throw new AIContentBlockedError()
        if (last === 'cancelled' || last === 'lease_lost' || last === 'lease_hold_expired') throw new AIUnavailableError(attempts, last)
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
  const body = trimmed.slice(start, end + 1)
  try { return JSON.parse(body) } catch { /* fall through to bracket repair */ }
  try { return JSON.parse(dropUnmatchedClosers(body)) } catch { return null }
}

/**
 * 짝이 없는 닫는 괄호를 버린다. 실측: gemini-3.5-flash-lite 는 `"rp":{"blocks":[…]}]` 처럼
 * 객체를 닫은 뒤 `]` 를 하나 더 뱉는 일이 잦다(8회 중 3회). 문법 오류 하나로 대사 전체가 버려지므로,
 * 문자열 안은 건드리지 않고 스택과 맞지 않는 `]`/`}` 만 떨어뜨린다. 여는 괄호는 추가하지 않는다 —
 * 잘린 출력을 지어내 완성하는 것은 다른 문제다.
 */
function dropUnmatchedClosers(text: string): string {
  const stack: string[] = []
  let out = '', inString = false, escaped = false
  for (const ch of text) {
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; out += ch; continue }
    if (ch === '{' || ch === '[') { stack.push(ch === '{' ? '}' : ']'); out += ch; continue }
    if (ch === '}' || ch === ']') {
      if (stack[stack.length - 1] === ch) { stack.pop(); out += ch }
      // 짝이 없으면 버린다.
      continue
    }
    out += ch
  }
  return out
}
