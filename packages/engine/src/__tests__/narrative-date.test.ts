import { describe, expect, it } from 'vitest'
import { agencyClock, createAgencyState, type AgencyGoal, type CompiledCharacter } from '@miro/domain'
import type { LLMProvider } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { planAgencyDecision, AGENCY_PLANNER_VERSION } from '../agency/planner'
import { snapshot, world } from './fixtures'
import { buildContext } from '../context'

const now = new Date('2026-10-11T12:00:00Z')
const compiled: CompiledCharacter = { version: 1, sourceHash: 'fixture', rules: [{ id: 'promise', domain: 'value', statement: '약속을 지킨다.',
  source: { field: 'personality', start: 0, end: 8 }, origin: 'explicit', confidence: 1 }] }
const state = () => createAgencyState('revision', now.toISOString())
const context = (date: string, background = false) => ({ sessionId: 's1', revisionId: 'revision', actor: 'c1',
  clock: agencyClock(now, 'Asia/Seoul', background ? 'background' as const : 'user' as const, date),
  permissions: { contact: true, capabilities: ['respond', 'contact', 'message', 'wait'] },
  evidence: [{ id: 'input', sessionId: 's1', actor: 'user', kind: 'message' as const, epistemic: 'reported' as const, quote: '왔어.', occurredAt: now.toISOString(), knownTo: ['c1'] }] })
const response = (goalIds: string[] = [], action = 'respond') => ({ appraisal: { interpretation: '다시 만난 상대에게 대답한다.', evidenceIds: ['input'], ruleIds: ['promise'],
  goalCongruence: 0, valueConflict: 0, responsibility: 'uncertain', affectDelta: { valence: 0, arousal: 0, stress: 0, energy: 0 }, expression: { openness: 30, directness: 50 }, beliefs: [] },
  candidates: [{ id: 'reply', action, description: '약속한 답을 한다.', targetActor: 'c1', evidenceIds: ['input'], ruleIds: ['promise'], goalIds, fulfillsGoalIds: goalIds,
    ruleFit: [], goalFit: [], preconditions: [], uncertainty: .1, cost: .1 }], newGoals: [], goalChanges: [] })

describe('story date in the actual planner and renderer', () => {
  it('leaves messenger and call calendars on real time even when the scene has a selected date', () => {
    const calendar = { version: 1 as const, date: '1850-06-25', previousDate: '1850-06-18', changedAtTurn: 3 }
    for (const mode of ['messenger', 'voice_call', 'video_call'] as const) {
      const context = buildContext(snapshot({ mode, turnCount: 3, world: world({ narrativeCalendar: calendar }) }))
      expect(context.prompt).not.toContain('Story date selected by the user')
      expect(context.prompt).not.toContain('moved forward 7 calendar day(s)')
    }
  })
  it('plans the first response after a date move even for a short routine input, and passes elapsed time to both model stages', async () => {
    const requests: Array<{ version?: string; prompt: string }> = []
    const llm: LLMProvider = { info: { mode: 'mock', name: 'calendar-contract', notice: 'Synthetic' }, async generateStructured(request) {
      requests.push({ version: request.promptVersion, prompt: request.prompt })
      if (request.task === 'agency_verify') return request.schema.parse({ acceptable: true, blockIndex: 0, reason: 'none' })
      return request.schema.parse(request.promptVersion === AGENCY_PLANNER_VERSION ? response() : { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '일주일 만이군요.' }] } })
    } }
    const calendar = { version: 1 as const, date: '1850-06-25', previousDate: '1850-06-18', changedAtTurn: 3 }
    const result = await runTurn({ llm, snapshot: snapshot({ experienceType: 'reality', turnCount: 3, world: world({ narrativeCalendar: calendar }) }), userInput: '왔어.',
      agency: { mode: 'live', compiled, state: state(), context: context(calendar.date) } })
    expect(requests.find(r => r.version === AGENCY_PLANNER_VERSION)?.prompt).toContain('moved forward 7 calendar day(s)')
    expect(requests.find(r => r.version?.startsWith('agency-dialogue'))?.prompt).toContain('Story date selected by the user: 1850-06-25')
    expect(result.transition.relationshipDelta).toEqual({})
  })
  it('does not fulfill a narrative promise before its date or through a background message on the real clock', async () => {
    const goal: AgencyGoal = { id: 'scene-promise', description: '다음 날 직접 말로 물어본다.', status: 'active', evidenceIds: ['input'], ruleIds: ['promise'],
      priority: .8, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueAt: '1850-06-19T00:00:00Z', clock: 'narrative', success: 'action_accepted' }
    const llm: LLMProvider = { info: { mode: 'mock', name: 'calendar-contract', notice: 'Synthetic' }, async generateStructured(request) { return request.schema.parse(response([goal.id])) } }
    const early = await planAgencyDecision(llm, compiled, { ...state(), goals: [goal] }, context('1850-06-18'))
    expect(early.decision.candidate.fulfillsGoalIds).toEqual([])
    const due = await planAgencyDecision(llm, compiled, { ...state(), goals: [goal] }, context('1850-06-19'))
    expect(due.decision.candidate.fulfillsGoalIds).toEqual([goal.id])
    const background = await planAgencyDecision(llm, compiled, { ...state(), goals: [goal] }, context('2099-01-01', true))
    expect(background.decision.candidate.fulfillsGoalIds).toEqual([])
  })
})
