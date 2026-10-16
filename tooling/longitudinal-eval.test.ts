import { describe, expect, it } from 'vitest'
import { canReserve, frozenInput, frozenPlan, HORIZON_CHECKPOINTS, ledgerTotals, longitudinalModelEnvironment, requestRecovery, validateCarriedLedger, type ExperimentLedger } from '../ai/evals/agency/longitudinal-support'

const ledger = (): ExperimentLedger => ({ version: 1, limitUSD: 20, limitRequests: 5000, attempts: [] })
describe('live longitudinal evaluation guardrails', () => {
  it('passes the verifier role and timeout to the real worker without forwarding production data credentials', () => {
    const configured = longitudinalModelEnvironment({ MIRO_AGENCY_VERIFY_MODEL_ID: 'claude-sonnet', AI_TIMEOUT_MS: '30000',
      MIRO_CHAT_MODEL_ID: 'gemini-flash', GEMINI_API_KEY: 'private-provider-key', DATABASE_URL: 'private-production-db', PUSH_SECRET: 'private-push-secret' })
    expect(configured.providerEnv).toMatchObject({ MIRO_AGENCY_VERIFY_MODEL_ID: 'claude-sonnet', AI_TIMEOUT_MS: '30000',
      MIRO_CHAT_MODEL_ID: 'gemini-flash', GEMINI_API_KEY: 'private-provider-key' })
    expect(configured.providerEnv).not.toHaveProperty('DATABASE_URL')
    expect(configured.providerEnv).not.toHaveProperty('PUSH_SECRET')
    expect(configured.configuration.verifierModel.effective).toBe('claude-sonnet')
    expect(configured.configuration.timeout.effectiveMs).toBe(30000)
    expect(JSON.stringify(configured.configuration)).not.toContain('private-')
  })
  it('records absent model options and their app defaults without injecting an override', () => {
    const defaults = longitudinalModelEnvironment({})
    expect(defaults.providerEnv).not.toHaveProperty('MIRO_AGENCY_VERIFY_MODEL_ID')
    expect(defaults.providerEnv).not.toHaveProperty('AI_TIMEOUT_MS')
    expect(defaults.configuration.verifierModel).toEqual({ configured: null, effective: null, default: 'registry task routing' })
    expect(defaults.configuration.timeout).toEqual({ configured: null, effectiveMs: 20000 })
    expect(defaults.configuration.mode).toEqual({ configured: null, effective: 'production' })
    expect(defaults.configuration.agencyMode).toBe('live')
  })
  it('changes the immutable configuration for role, timeout, endpoint and mode changes without leaking endpoint secrets', () => {
    const original = JSON.stringify(longitudinalModelEnvironment({}).configuration)
    const overrides: Record<string, string>[] = [{ MIRO_AGENCY_VERIFY_MODEL_ID: 'claude-sonnet' }, { AI_TIMEOUT_MS: '30000' },
      { OPENAI_BASE_URL: 'https://private-user:private-password@example.invalid/v1' }, { MIRO_SLM_URL: 'https://private-slm.invalid' },
      { MIRO_SLM_MODEL: 'new-model' }, { MIRO_MODE: 'alpha' }]
    for (const override of overrides) {
      const changed = JSON.stringify(longitudinalModelEnvironment(override).configuration)
      expect(changed).not.toBe(original)
      expect(changed).not.toContain('private-')
    }
  })
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
  it('carries all prior attempts including unresolved reservations without changing their status or source', () => {
    const previous = ledger()
    previous.attempts.push(
      { id: 'timeout', at: '', task: 'agency_compile', provider: 'gemini', model: 'live', reservedUSD: 19, chargedUSD: 19, status: 'reserved' },
      { id: 'settled', at: '', task: 'agency_compile', provider: 'anthropic', model: 'live', reservedUSD: .5, chargedUSD: .2, status: 'completed', ok: true },
      { id: 'denied', at: '', task: 'dialogue', provider: 'gemini', model: 'live', reservedUSD: 1, chargedUSD: 0, status: 'denied' },
    )
    const carried = validateCarriedLedger(previous, 20, 5000)
    expect(carried).toEqual(previous)
    expect(ledgerTotals(carried)).toEqual({ chargedUSD: 19.2, requests: 2, unresolved: 1 })
    expect(canReserve(carried, 1)).toBe(false)
    carried.attempts[0]!.chargedUSD = 0
    expect(previous.attempts[0]!.chargedUSD).toBe(19)
  })
  it('rejects changed caps, corrupted costs, duplicate attempts, and discounted unresolved carry budgets', () => {
    const previous = ledger()
    previous.attempts.push({ id: 'one', at: '', task: 'dialogue', provider: 'gemini', model: 'live', reservedUSD: .1, chargedUSD: .1, status: 'reserved' })
    expect(() => validateCarriedLedger(previous, 21, 5000)).toThrow(/same/)
    expect(() => validateCarriedLedger(previous, 20, 5001)).toThrow(/same/)
    expect(() => validateCarriedLedger({ ...previous, version: 2 }, 20, 5000)).toThrow()
    expect(() => validateCarriedLedger(null, 20, 5000)).toThrow()
    expect(() => validateCarriedLedger({ ...previous, attempts: [...previous.attempts, ...previous.attempts] }, 20, 5000)).toThrow(/duplicated/)
    for (const chargedUSD of [-1, NaN, Infinity, .09]) {
      expect(() => validateCarriedLedger({ ...previous, attempts: [{ ...previous.attempts[0], chargedUSD }] }, 20, 5000)).toThrow()
    }
    expect(() => validateCarriedLedger({ ...previous, attempts: [{ ...previous.attempts[0], status: 'denied' }] }, 20, 5000)).toThrow()
    expect(() => validateCarriedLedger({ ...previous, attempts: [{ ...previous.attempts[0], reservedUSD: 21, chargedUSD: 21 }] }, 20, 5000)).toThrow(/exceeded/)
    const capped = { ...previous, limitRequests: 1, attempts: [...previous.attempts, { ...previous.attempts[0]!, id: 'two' }] }
    expect(() => validateCarriedLedger(capped, 20, 1)).toThrow(/exceeded/)
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
