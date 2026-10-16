import { describe, expect, it } from 'vitest'
import { generationInputCeiling, type LLMProvider } from '@miro/providers'
import { planAgencyDecision } from '../planner'
import { evidence, NOW, planProposal, recordedProvider, setupCompiled } from './fixtures'

function measuredProvider() {
  let requestBytes = 0, payload: Record<string, any> = {}
  const base = recordedProvider([planProposal()])
  const llm: LLMProvider = { ...base, async generateStructured(request) {
    requestBytes = generationInputCeiling({ ...request, task: request.task ?? 'agency_plan' })
    payload = JSON.parse(request.prompt)
    return base.generateStructured(request)
  } }
  return { llm, bytes: () => requestBytes, payload: () => payload }
}

describe('planner transmission context', () => {
  it('fits Korean history by UTF-8 request bytes, including schema and system instructions', async () => {
    const { compiled, state, context } = await setupCompiled()
    context.evidence.push(...Array.from({ length: 20 }, (_, i) => evidence({ id: `older-${i}`, quote: '가'.repeat(1_000), occurredAt: '2026-09-01T00:00:00Z' })))
    const provider = measuredProvider()
    await planAgencyDecision(provider.llm, compiled, state, context)
    expect(provider.bytes()).toBeLessThanOrEqual(64_000)
  })

  it('bounds a 125-message snapshot while retaining current input, correction and unfulfilled promise references', async () => {
    const { compiled, state, context } = await setupCompiled()
    const old = Array.from({ length: 120 }, (_, i) => evidence({ id: `older-${i}`, quote: `지난 대화 ${i}: ${'그때 나눈 이야기.'.repeat(180)}`,
      occurredAt: new Date(Date.parse(NOW) - (121 - i) * 60_000).toISOString() }))
    const correction = evidence({ id: 'correction', quote: '전에는 선생님이라고 불러 달랬지만 이제 이름으로 불러 줘.', occurredAt: '2026-09-24T05:59:00Z' })
    const current = evidence({ quote: '우리가 정한 약속이 어떻게 됐지?' })
    context.evidence = [...old, correction, current]
    context.input = current.quote
    state.goals = [{ id: 'pending-promise', description: '다음 만남에서 마지막 장을 함께 읽기로 했다.', evidenceIds: ['older-2'], ruleIds: ['value-promise'],
      priority: .8, status: 'active', createdAt: old[2]!.occurredAt, updatedAt: old[2]!.occurredAt, success: 'action_accepted' }]
    state.beliefs = [{ id: 'retained-belief', statement: '사용자가 책의 결말을 궁금해 한다.', evidenceIds: ['older-3'], confidence: .7, status: 'active', updatedAt: old[3]!.occurredAt }]
    const before = JSON.stringify(context)
    const provider = measuredProvider()
    const result = await planAgencyDecision(provider.llm, compiled, state, context)
    expect(provider.bytes()).toBeLessThanOrEqual(64_000)
    const payload = provider.payload()
    expect(payload.input).toBe(current.quote)
    expect(payload.evidence).toContainEqual(expect.objectContaining({ id: correction.id, quote: correction.quote }))
    expect(payload.evidence.map((item: { id: string }) => item.id)).toEqual(expect.arrayContaining([current.id, 'older-2', 'older-3']))
    expect(payload.goals).toContainEqual(state.goals[0])
    expect(payload.coverage.omittedEvidenceIds.length).toBeGreaterThan(0)
    expect(result.context.evidence).toEqual(context.evidence)
    expect(JSON.stringify(context)).toBe(before)
  })

  it('labels excerpts when every old source is still referenced and keeps the original evidence untouched', async () => {
    const { compiled, state, context } = await setupCompiled()
    const old = Array.from({ length: 32 }, (_, i) => evidence({ id: `source-${i}`, quote: `${'가'.repeat(1_970)} 단, 내가 다시 허락하기 전에는 하지 마.`, occurredAt: '2026-09-01T00:00:00Z' }))
    context.evidence.push(...old)
    state.beliefs = old.map((source, i) => ({ id: `belief-${i}`, statement: '전에 들은 말이며 상황이 바뀌었을 수 있다.',
      evidenceIds: [source.id], confidence: .4, status: 'active', updatedAt: source.occurredAt }))
    const provider = measuredProvider()
    const result = await planAgencyDecision(provider.llm, compiled, state, context)
    const payload = provider.payload()
    expect(provider.bytes()).toBeLessThanOrEqual(64_000)
    expect(payload.evidence).toHaveLength(context.evidence.length)
    const excerpt = payload.evidence.find((item: { excerpted?: boolean }) => item.excerpted)
    expect(excerpt.originalQuoteLength).toBeGreaterThan(excerpt.quote.length)
    expect(excerpt.quote).toContain('source is incomplete')
    expect(excerpt.quote).toContain('내가 다시 허락하기 전에는 하지 마')
    expect(result.context.evidence.find(source => source.id === excerpt.id)!.quote).toBe(old.find(source => source.id === excerpt.id)!.quote)
  })
})
