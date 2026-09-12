import { describe, expect, it } from 'vitest'
import { evaluateEligibility, nextCooldownTurn, selectEvent } from '../event/eligibility'
import type { EventCandidate, SimulationEvent } from '../event/types'

function candidate(over: Partial<EventCandidate> = {}): EventCandidate {
  return { type: 'jealousy', context: {}, participantNpcIds: [], relevance: 0.9, salience: 0.9, ...over }
}

function event(over: Partial<SimulationEvent> = {}): SimulationEvent {
  return {
    id: 'e1', sessionId: 's1', type: 'jealousy', status: 'active',
    context: {}, participantNpcIds: [], continuationState: {}, consequences: [],
    cooldownUntilTurn: 0, createdAtTurn: 0, resolvedAtTurn: null, ...over,
  }
}

describe('event eligibility', () => {
  it('T5: cooldown blocks the same event type on consecutive turns', () => {
    const resolved = [event({ status: 'resolved', cooldownUntilTurn: nextCooldownTurn(5) })]
    const r = evaluateEligibility({ candidate: candidate(), activeEvents: [], resolvedEvents: resolved, currentTurn: 6 })
    expect(r).toEqual({ eligible: false, reason: 'cooldown' })
  })

  it('allows the type again once cooldown has elapsed', () => {
    const resolved = [event({ status: 'resolved', cooldownUntilTurn: 8 })]
    const r = evaluateEligibility({ candidate: candidate(), activeEvents: [], resolvedEvents: resolved, currentTurn: 9 })
    expect(r.eligible).toBe(true)
  })

  it('blocks when max active events reached', () => {
    const active = [event({ id: 'a', type: 'crisis' }), event({ id: 'b', type: 'injury' })]
    const r = evaluateEligibility({ candidate: candidate(), activeEvents: active, resolvedEvents: [], currentTurn: 1 })
    expect(r).toEqual({ eligible: false, reason: 'max_active_events' })
  })

  it('blocks a duplicate of an already-active type', () => {
    const r = evaluateEligibility({ candidate: candidate(), activeEvents: [event()], resolvedEvents: [], currentTurn: 1 })
    expect(r).toEqual({ eligible: false, reason: 'duplicate_active' })
  })

  it('T-C: meeting conditions is not enough — low relevance yields no event', () => {
    const weak = candidate({ relevance: 0.1, salience: 0.1 })
    const r = evaluateEligibility({ candidate: weak, activeEvents: [], resolvedEvents: [], currentTurn: 1 })
    expect(r).toEqual({ eligible: false, reason: 'below_threshold' })
  })

  it('selects at most one event per turn', () => {
    const picked = selectEvent(
      [candidate({ type: 'jealousy' }), candidate({ type: 'crisis' }), candidate({ type: 'injury' })],
      [], [], 1,
    )
    expect(picked).not.toBeNull()
    expect(picked!.candidate.type).toBeDefined()
  })

  it('T1: identical elapsed time with different state gives different outcomes', () => {
    const turn = 10
    // 동일 턴, 동일 후보. 차이는 현재 상태뿐.
    const quiet = selectEvent([candidate()], [], [], turn)
    const busy = selectEvent([candidate()], [event({ id: 'x', type: 'crisis' }), event({ id: 'y', type: 'work' })], [], turn)
    expect(quiet).not.toBeNull()
    expect(busy).toBeNull() // 시간이 아니라 상태가 결과를 갈랐다
  })
})
