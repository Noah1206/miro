import { describe, expect, it } from 'vitest'
import { createAgencyState, type AgencyGoal, type Memory } from '@miro/domain'
import { agencyEvidenceMessageRefs } from './evidence-refs'

const now = '2026-10-16T00:00:00Z'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const memory: Memory = { id: 'preference', sessionId: 'session', characterId: 'character', type: 'preference', content: '특별한 호칭보다 이름을 선호한다.',
  sourceMessageId: id(1000), confidence: .9, importance: .9, persistence: .9, tags: ['대화 선호'], createdAt: new Date(now) }
const goal = (n: number, status: AgencyGoal['status'] = 'active'): AgencyGoal => ({ id: `goal-${n}`, description: '미완료 약속', status,
  evidenceIds: Array.from({ length: 12 }, (_, i) => id(n * 12 + i)), ruleIds: [], priority: .8, success: 'sent', createdAt: now, updatedAt: now })

describe('bounded historical evidence references', () => {
  it('reserves preference originals when active goal references fill all 64 slots', () => {
    const state = createAgencyState('revision', now)
    state.goals = Array.from({ length: 24 }, (_, i) => goal(i))
    const refs = agencyEvidenceMessageRefs({ sessionId: 'session', characterId: 'character', memories: [memory], state, readMessageIds: [id(999)] })
    expect(refs).toHaveLength(64)
    expect(refs.slice(0, 2)).toEqual([id(1000), id(999)])
    expect(refs).toContain(id(0))
  })

  it('closed goals, retracted beliefs and completed receipts cannot crowd out active sources', () => {
    const state = createAgencyState('revision', now)
    state.goals = [...Array.from({ length: 23 }, (_, i) => goal(i, 'completed')), goal(50)]
    state.beliefs = [{ id: 'old-belief', statement: '철회됨', evidenceIds: [id(800)], confidence: .1, status: 'retracted', updatedAt: now }]
    state.actions = [{ id: 'closed-action', type: 'respond', status: 'completed', evidenceIds: [], goalIds: [], outcomeEvidenceId: `${id(900)}:sent`, createdAt: now, updatedAt: now }]
    const refs = agencyEvidenceMessageRefs({ sessionId: 'session', characterId: 'character', memories: [memory], state })
    expect(refs).toEqual([id(1000), ...goal(50).evidenceIds])
    expect(refs).not.toContain(id(800))
    expect(refs).not.toContain(id(900))
  })

  it('does not reserve foreign memories and still reloads a receipt for an unfinished goal', () => {
    const state = createAgencyState('revision', now)
    state.goals = [goal(1)]
    state.actions = [{ id: 'still-relevant', type: 'contact', status: 'sent', evidenceIds: [], goalIds: ['goal-1'], fulfillsGoalIds: ['goal-1'],
      outcomeEvidenceId: `${id(900)}:sent`, createdAt: now, updatedAt: now }]
    const refs = agencyEvidenceMessageRefs({ sessionId: 'session', characterId: 'character', memories: [{ ...memory, sessionId: 'other' }], state })
    expect(refs).not.toContain(memory.sourceMessageId)
    expect(refs).toContain(id(900))
  })
})
