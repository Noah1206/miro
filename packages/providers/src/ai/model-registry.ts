import { z } from 'zod'
import { AI_TASKS, importanceScore, type AITask, type InteractionImportance } from './tasks'

export const ModelDefinitionSchema = z.object({
  id: z.string().min(1), provider: z.enum(['gemini', 'openai', 'anthropic', 'cloudflare', 'gateway', 'miro-slm', 'mock', 'replicate']),
  providerModelId: z.string().min(1), tier: z.enum(['small', 'standard', 'premium']),
  capabilities: z.array(z.enum(AI_TASKS)).min(1),
  inputCost: z.number().nonnegative().optional(), outputCost: z.number().nonnegative().optional(),
  maxContextTokens: z.number().int().positive(), maxOutputTokens: z.number().int().positive().default(1024),
  enabled: z.boolean().default(true), version: z.string().default('unversioned'),
  trainingAllowed: z.boolean().default(false),
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

export type RolloutPolicy = { canaryModel?: string; canaryPercent?: number; approved?: boolean; rollback?: boolean; shadowModel?: string }
export function cohort(key: string): number {
  let hash = 2166136261
  for (const c of key) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return (hash >>> 0) % 10_000 / 100
}
export function routeModels(registry: ModelRegistry, task: AITask, importance: InteractionImportance, tokens: number,
  key: string, rollout: RolloutPolicy = {}, continuity = false): ModelDefinition[] {
  const tier = continuity || importanceScore(importance) < .35 ? 'small' : importanceScore(importance) < .85 ? 'standard' : 'premium'
  const rank = { small: 0, standard: 1, premium: 2 }
  const eligible = registry.models.filter(m => m.enabled && m.capabilities.includes(task) && m.maxContextTokens >= tokens + m.maxOutputTokens && (!continuity || m.tier === 'small'))
  const regular = eligible.filter(m => m.id !== rollout.canaryModel && m.id !== rollout.shadowModel && m.provider !== 'miro-slm').sort((a,b) =>
    Math.abs(rank[a.tier]-rank[tier]) - Math.abs(rank[b.tier]-rank[tier]) || rank[a.tier]-rank[b.tier])
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
