import { describe, expect, it } from 'vitest'
import { canReserve, frozenInput, frozenPlan, HORIZON_CHECKPOINTS, ledgerTotals, requestRecovery, type ExperimentLedger } from '../ai/evals/agency/longitudinal-support'

const ledger = (): ExperimentLedger => ({ version: 1, limitUSD: 20, limitRequests: 5000, attempts: [] })
describe('live longitudinal evaluation guardrails', () => {
  it('recovers interruption before admission with the same key and never replaces an active request', () => {
    const now = new Date('2026-10-16T10:00:00Z')
    expect(requestRecovery(undefined, now)).toBe('reuse')
    expect(requestRecovery({ status: 'completed', leaseUntil: now }, now)).toBe('reuse')
    expect(requestRecovery({ status: 'pending', leaseUntil: new Date(now.getTime() + 1) }, now)).toBe('blocked')
    expect(requestRecovery({ status: 'pending', leaseUntil: now }, now)).toBe('expire')
    expect(requestRecovery({ status: 'failed', leaseUntil: now }, now)).toBe('retry_failed')
    expect(requestRecovery({ status: 'unknown', leaseUntil: now }, now)).toBe('blocked')
  })
  it('retains timeout reservations after JSON round-trip and cannot reset them on resume', () => {
    const original = ledger()
    original.attempts.push({ id: 'timeout', at: '2026-10-16T10:00:00Z', task: 'agency_compile', provider: 'gemini', model: 'gemini-test',
      reservedUSD: 19.99, chargedUSD: 19.99, status: 'reserved' })
    const resumed = JSON.parse(JSON.stringify(original)) as ExperimentLedger
    expect(ledgerTotals(resumed)).toEqual({ chargedUSD: 19.99, requests: 1, unresolved: 1 })
    expect(canReserve(resumed, .02)).toBe(false)
    expect(canReserve(resumed, .01)).toBe(true)
  })
  it('counts failed actual calls and simulator/judge/compiler equally toward a shared limit', () => {
    const cumulative = ledger(); cumulative.limitRequests = 4
    for (const task of ['agency_compile', 'dialogue', 'memory_extraction', 'agency_verify']) cumulative.attempts.push({
      id: task, at: '', task, provider: 'gemini', model: 'live', reservedUSD: .01, chargedUSD: .01, status: 'completed', ok: false,
    })
    expect(ledgerTotals(cumulative).requests).toBe(4)
    expect(canReserve(cumulative, 0)).toBe(false)
  })
  it('does not count app-denied inference as an actual provider request, and rejects unknown estimates', () => {
    const budget = ledger()
    budget.attempts.push({ id: 'denied', at: '', task: 'dialogue', provider: 'gemini', model: 'live', reservedUSD: 1, chargedUSD: 0, status: 'denied' })
    expect(ledgerTotals(budget)).toEqual({ chargedUSD: 0, requests: 0, unresolved: 0 })
    for (const price of [NaN, Infinity, -1]) expect(canReserve(budget, price)).toBe(false)
  })
  it('fixes independent user facts once, keeps late probes from revealing their answers, and extends past 120', () => {
    const plan = frozenPlan()
    expect(plan).toHaveLength(3)
    expect(new Set(plan.map(p => p.persona.beverage)).size).toBe(3)
    expect(HORIZON_CHECKPOINTS).toEqual([30, 60, 100, 120, 125])
    for (const [slot, entry] of plan.entries()) {
      expect(frozenInput(2, slot)).toContain(entry.persona.beverage)
      expect(frozenInput(30, slot)).not.toContain(entry.persona.beverage)
      expect(frozenInput(120, slot)).not.toContain(entry.persona.object)
      expect(frozenInput(100, slot)).not.toContain('취소')
      expect(frozenInput(50, slot)).toBeNull() // Requires response-aware live simulator, not 120 static inputs.
    }
  })
})
