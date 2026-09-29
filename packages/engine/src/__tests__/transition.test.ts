import { describe, expect, it } from 'vitest'
import { approveTransition } from '../transition'
import { resolveTurnPolicy } from '../policy'
import type { ValidatedTransition } from '../validator'
import { event, snapshot } from './fixtures'

const base = (): ValidatedTransition => ({
  blocks: [{ type: 'dialogue', speaker: '토마스', text: '네.' }], worldDelta: { currentLocation: '역 앞' }, relationshipDelta: { trust: 2 },
  sceneDelta: null, memories: [], newEvent: { candidate: { type: 'crisis', context: {}, participantNpcIds: [], relevance: 1, salience: 1 }, score: 1 },
  eventUpdates: [{ eventId: 'e1', status: 'resolved' }], npcIntroductions: [], npcActions: [], realityIntent: { channel: 'message', reason: '보고 싶다', urgency: .7 },
  emotion: undefined, intent: undefined, issues: [{ field: 'rp.blocks', reason: 'unknown speaker: 이수현' }],
})
const chat = resolveTurnPolicy({ experience: 'chat', tier: 'echo', channel: 'scene', agencyMode: 'off', agencyReady: false })
const reality = resolveTurnPolicy({ experience: 'reality', tier: 'miro', channel: 'scene', agencyMode: 'off', agencyReady: false })

/** §3.3·§3.4: 승인은 표현 전에, 원장은 서버가 승인한 결과만, 사유는 고정 코드로. */
describe('approveTransition', () => {
  it('strips world, event and proactive effects for a standard character and records each rejection by code', () => {
    const { transition, records } = approveTransition(base(), snapshot({ experienceType: 'chat', activeEvents: [event()] }), chat)
    expect(transition.worldDelta).toBeNull()
    expect(transition.newEvent).toBeNull()
    expect(transition.eventUpdates).toEqual([])
    expect(transition.realityIntent).toBeNull()
    expect(records.filter(r => r.rule === 'chat_boundary').map(r => r.field).sort()).toEqual(['event', 'eventUpdates', 'session.pendingRealityIntent', 'world'])
    // 관계는 규칙이 움직였다 — 그 사실은 남는다. 검증기의 자유 문구(화자 이름)는 남지 않는다.
    expect(records).toContainEqual(expect.objectContaining({ field: 'relationship.trust', before: 30, after: 32, rule: 'relationship_rules', status: 'applied', actor: 'rules' }))
    const rejected = records.find(r => r.rule === 'validator_rejected')!
    expect(rejected.field).toBe('rp.blocks')
    expect(JSON.stringify(rejected)).not.toContain('이수현')
  })
  it('keeps a reality character\'s approved world and event changes and writes their before/after', () => {
    const { transition, records } = approveTransition(base(), snapshot({ experienceType: 'reality', activeEvents: [event()] }), reality)
    expect(transition.worldDelta).toEqual({ currentLocation: '역 앞' })
    expect(records).toContainEqual(expect.objectContaining({ field: 'world.currentLocation', before: '런던 구시가지', after: '역 앞', rule: 'world_delta', status: 'applied', clock: 'narrative' }))
    expect(records).toContainEqual(expect.objectContaining({ field: 'event.e1.status', before: 'active', after: 'resolved', rule: 'event_updated', target: 'e1' }))
    expect(records).toContainEqual(expect.objectContaining({ field: 'event.new', after: 'crisis', rule: 'event_created' }))
    expect(records).toContainEqual(expect.objectContaining({ field: 'session.pendingRealityIntent', rule: 'reality_intent', clock: 'real' }))
  })
  it('names one relationship owner per policy and never both', () => {
    const rules = approveTransition(base(), snapshot(), reality, { relationshipOwner: 'rules' }).records.filter(r => r.field.startsWith('relationship.'))
    const appraisal = approveTransition(base(), snapshot(), reality, { relationshipOwner: 'appraisal', decisionId: 'd1' }).records.filter(r => r.field.startsWith('relationship.'))
    expect(rules.map(r => r.rule)).toEqual(['relationship_rules'])
    expect(appraisal.map(r => r.rule)).toEqual(['relationship_appraisal'])
    expect(appraisal[0]!.decisionId).toBe('d1')
  })
  it('records nothing for a field that did not change', () => {
    const t = { ...base(), worldDelta: { currentLocation: '런던 구시가지' }, relationshipDelta: {}, newEvent: null, eventUpdates: [], realityIntent: null, issues: [] }
    expect(approveTransition(t, snapshot(), reality).records).toEqual([])
  })
})
