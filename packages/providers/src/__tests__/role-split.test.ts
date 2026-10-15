import { describe, expect, it } from 'vitest'
import definitions from '../../../../ai/models/miro-role-split.json'
import { ModelRegistry, routeModels } from '../ai/model-registry'
import { AI_TASKS } from '../ai/tasks'

describe('production role split', () => {
  const registry = new ModelRegistry(definitions)
  const analysis = new Set(['semantic_event', 'relationship_analysis', 'memory_extraction', 'memory_summary'])
  it('routes every supported task to its intended primary and retains an independent provider backup', () => {
    for (const task of AI_TASKS) {
      const candidates = routeModels(registry, task, 12000, 'role-split-test')
      expect(candidates[0]?.id, task).toBe(analysis.has(task) ? 'gemini-flash-lite' : 'gemini-flash')
      expect(candidates.at(-1)?.id, task).toBe('claude-sonnet')
    }
  })
  it('keeps the analysis model and backup out of selectable dialogue models', () => {
    expect(registry.models.filter(m => !m.fallback && m.capabilities.includes('dialogue')).map(m=>m.id)).toEqual(['gemini-flash'])
  })
})
