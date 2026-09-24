import { describe, expect, it } from 'vitest'
import type { LLMProvider } from '@miro/providers'
import { AgencyCompilerProposalSchema } from '../compiler'
import { AgencyPlanProposalSchema } from '../planner'
import { AgencyRealizationAssessmentSchema } from '../realization'
import { generateAgencyStructured, responseJsonSchema } from '../provider'

/** Documented Gemini keywords, minus array bounds: with those, gemini-3.8-flash rejected all three schemas (HTTP 400). */
const SUPPORTED = new Set(['type', 'properties', 'required', 'additionalProperties', 'enum', 'format', 'description', 'items', 'minimum', 'maximum', 'anyOf'])
const keywords = (node: unknown): string[] => !node || typeof node !== 'object' ? []
  : Array.isArray(node) ? node.flatMap(keywords)
  : Object.entries(node).flatMap(([key, value]) => [key, ...(key === 'properties' ? Object.values(value as object).flatMap(keywords) : keywords(value))])

describe('agency structured output', () => {
  it('describes every agency schema with keywords the provider can enforce', () => {
    for (const schema of [AgencyCompilerProposalSchema, AgencyPlanProposalSchema, AgencyRealizationAssessmentSchema]) {
      const json = responseJsonSchema(schema)
      expect(keywords(json).filter(key => !SUPPORTED.has(key))).toEqual([])
    }
    const plan = responseJsonSchema(AgencyPlanProposalSchema) as { additionalProperties: boolean; properties: { candidates: { description: string; items: { required: string[]; properties: { action: { enum: string[] }; preconditions: { items: { anyOf: unknown[] } } } } } } }
    const candidate = plan.properties.candidates.items
    expect(plan.additionalProperties).toBe(false)
    expect(plan.properties.candidates.description).toBe('1 to 5 items')
    expect(candidate.required).toEqual(expect.arrayContaining(['ruleIds', 'evidenceIds', 'goalIds']))
    expect(candidate.required).not.toContain('fulfillsGoalIds')
    expect(candidate.properties.action.enum).toContain('wait')
    expect(candidate.properties.preconditions.items.anyOf).toHaveLength(5)
  })

  it('asks for the schema and allows exactly one retry', async () => {
    const seen: Array<{ maxRetries?: number; responseSchema?: unknown }> = []
    const llm: LLMProvider = { info: { mode: 'mock', name: 'capture', notice: null },
      async generateStructured(opts) { seen.push(opts); return opts.schema.parse({ decisionId: 'd', aligned: true, claims: [], unsupported: [], violations: [] }) } }
    await generateAgencyStructured(llm, { schema: AgencyRealizationAssessmentSchema, system: '', prompt: '', promptVersion: 'v', maxTokens: 10 })
    expect(seen[0]).toMatchObject({ maxRetries: 1, responseSchema: responseJsonSchema(AgencyRealizationAssessmentSchema) })
  })
})
