import { z } from 'zod'
import { AI_TASKS, STRONG_TASKS, type AITask } from './tasks'

const isTask = (task: string): task is AITask => (AI_TASKS as readonly string[]).includes(task)
export const ModelDefinitionSchema = z.object({
  id: z.string().min(1), provider: z.enum(['gemini', 'openai', 'anthropic', 'cloudflare', 'gateway', 'miro-slm', 'mock', 'replicate', 'openrouter']),
  providerModelId: z.string().min(1), tier: z.enum(['small', 'standard', 'premium']),
  /** 없어진 작업 이름(10/2 moderation)은 버린다 — env 의 레지스트리를 고치기 전에 배포돼도 AI 전체가 멈추지 않게. */
  capabilities: z.array(z.string()).min(1).transform(list => list.filter(isTask)),
  inputCost: z.number().nonnegative().optional(), outputCost: z.number().nonnegative().optional(),
  maxContextTokens: z.number().int().positive(), maxOutputTokens: z.number().int().positive().default(1024),
  enabled: z.boolean().default(true), version: z.string().default('unversioned'),
  trainingAllowed: z.boolean().default(false),
  /** 예비 — 기본 모델이 공급자 장애로 실패할 때만 쓴다. 사용자가 고르는 대화 모델이 되지 않는다. */
  fallback: z.boolean().optional(),
})
export type ModelDefinition = z.infer<typeof ModelDefinitionSchema>
export class ModelRegistry {
  readonly models: ModelDefinition[]
  constructor(input: unknown) {
    this.models = z.array(ModelDefinitionSchema).min(1).parse(input)
    if (new Set(this.models.map(m => m.id)).size !== this.models.length) throw new Error('duplicate model id')
  }
  get(id: string): ModelDefinition {
    const model = this.models.find(m => m.id === id && m.enabled)
    if (!model) throw new Error('model unavailable: ' + id)
    return model
  }
}

/** 이 모델이 이 일을 맡는가 — 레지스트리에 적었거나, 강한 일이면 대사를 맡은 모델이다. */
export function serves(m: ModelDefinition, task: AITask): boolean {
  return m.capabilities.includes(task) || (STRONG_TASKS.includes(task) && m.capabilities.includes('dialogue'))
}

export type RolloutPolicy = { canaryModel?: string; canaryPercent?: number; approved?: boolean; rollback?: boolean; shadowModel?: string }
export function cohort(key: string): number {
  let hash = 2166136261
  for (const c of key) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0) % 10_000 / 100
}
/**
 * 후보 순서: 기본 모델 → 예비. 같은 무리 안에서는 작업의 등급(강한 일 standard, 분류·기억 small)에 가까운 모델이 먼저다.
 * 등급을 프롬프트 길이로 짐작하지 않는다 — 전에는 300자만 넘어도 보조 호출이 가장 비싼 모델을 노렸다(10/2).
 */
export function routeModels(registry: ModelRegistry, task: AITask, tokens: number,
  key: string, rollout: RolloutPolicy = {}, continuity = false): ModelDefinition[] {
  const tier = continuity || !STRONG_TASKS.includes(task) ? 'small' : 'standard'
  const rank = { small: 0, standard: 1, premium: 2 }
  const eligible = registry.models.filter(m => m.enabled && serves(m, task) && m.maxContextTokens >= tokens + m.maxOutputTokens && (!continuity || m.tier === 'small'))
  const regular = eligible.filter(m => m.id !== rollout.canaryModel && m.id !== rollout.shadowModel && m.provider !== 'miro-slm').sort((a,b) =>
    Number(!!a.fallback) - Number(!!b.fallback) || Math.abs(rank[a.tier]-rank[tier]) - Math.abs(rank[b.tier]-rank[tier]) || rank[a.tier]-rank[b.tier])
  const canary = eligible.find(m => m.id === rollout.canaryModel)
  if (!continuity && !rollout.rollback && rollout.approved && canary && cohort(key) < Math.min(100, Math.max(0, rollout.canaryPercent ?? 0))) regular.unshift(canary)
  if (!regular.length) throw new Error('no capable model fits context')
  return regular.slice(0, 3)
}
/** USD per million tokens. Unknown prices stay unknown, never silently free. */
export function modelCost(m: ModelDefinition, input: number | null, output: number | null): number | null {
  if (m.provider === 'mock') return 0
  if (m.inputCost === undefined || m.outputCost === undefined || input === null || output === null) return null
  return Math.ceil((input * m.inputCost + output * m.outputCost) / 1_000_000 * 1e8) / 1e8
}
