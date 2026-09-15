export type UsagePolicy = {
  version: string; monthly: { free: number; pro: number }
  weights: Record<'textRP'|'complexEvent'|'majorEvent'|'characterDraft'|'photo'|'faceCast'|'background'|'liveScene'|'voiceCallPerMinute'|'videoCallPerMinute'|'semantic_event'|'relationship_analysis'|'memory_extraction'|'memory_summary'|'event_generation'|'world_update'|'image_prompt'|'moderation', number>
  continuity: { enabled: boolean; reserve: number; maxOutputTokens: number }
}
const defaults: UsagePolicy = {
  version: 'monthly-v1-dev', monthly: { free: 100, pro: 1000 },
  weights: { textRP: 1, complexEvent: 2, majorEvent: 3, characterDraft: 3, photo: 10, faceCast: 15, background: 8, liveScene: 12, voiceCallPerMinute: 5, videoCallPerMinute: 20,
    semantic_event: 1, relationship_analysis: 1, memory_extraction: 1, memory_summary: 1, event_generation: 3, world_update: 1, image_prompt: 1, moderation: 1 },
  continuity: { enabled: false, reserve: 5, maxOutputTokens: 128 },
}
/** Admin deployment config, deliberately separate from provider token prices. Invalid config fails closed. */
export function usagePolicy(): UsagePolicy {
  const raw = JSON.parse(process.env.MIRO_USAGE_POLICY || '{}')
  const p: UsagePolicy = { ...defaults, ...raw, monthly: { ...defaults.monthly, ...raw.monthly }, weights: { ...defaults.weights, ...raw.weights }, continuity: { ...defaults.continuity, ...raw.continuity } }
  for (const n of [...Object.values(p.monthly), ...Object.values(p.weights), p.continuity.reserve, p.continuity.maxOutputTokens]) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid usage policy')
  }
  if (!p.monthly.free || !p.monthly.pro || !p.continuity.maxOutputTokens || typeof p.continuity.enabled !== 'boolean' || typeof p.version !== 'string') throw new Error('invalid usage policy')
  return p
}
export function usageWeight(kind: string, units = 1): number {
  if (!Number.isSafeInteger(units) || units < 0) throw new Error('invalid usage units')
  const weight = usagePolicy().weights[kind as keyof UsagePolicy['weights']]
  if (weight === undefined) throw new Error('unknown usage kind')
  return weight * units
}
