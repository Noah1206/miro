import { describe, expect, it, vi } from 'vitest'

vi.mock('@miro/db', () => ({ db: {}, characters: {}, memories: {}, messages: {}, roleplaySessions: {} }))
vi.mock('@/lib/messenger/inbox', () => ({ characterCanSeeMessage: {} }))
vi.mock('@/lib/simulation/mock-llm', () => ({ auxiliaryLLM: vi.fn() }))
vi.mock('@/lib/observe', () => ({ observe: vi.fn() }))

const { maskExplicitHistory, decideAdultTurn, MASKED_FALLBACK } = await import('../inline-mirror')

const hist = [
  { id: 'a', role: 'user', content: '안녕' },
  { id: 'b', role: 'user', content: 'RAW1', isExplicit: true, blocks: [{ text: 'RAW1' }] },
  { id: 'c', role: 'character', content: 'RAW2', isExplicit: true },
  { id: 'd', role: 'user', content: '다음 날 아침' },
]

describe('inline mirror', () => {
  it('replaces one explicit run with one summary, caches it; raw never leaves', async () => {
    const summarize = vi.fn().mockResolvedValue('두 사람은 밤새 이야기를 나누며 서로를 신뢰하게 되었다.')
    const out = await maskExplicitHistory(hist, summarize)
    await maskExplicitHistory(hist, summarize)
    expect(summarize).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(out)).not.toContain('RAW')
    expect(out).toHaveLength(3)
  })
  it('falls back when the summary is explicit or the call fails', async () => {
    const other = hist.map(m => ({ ...m, id: 'x' + m.id }))
    for (const s of [vi.fn().mockResolvedValue('그들은 sex 를 했다'), vi.fn().mockRejectedValue(new Error('x'))]) {
      const out = await maskExplicitHistory(other, s)
      expect(out[1]!.content).toContain(MASKED_FALLBACK)
      expect(JSON.stringify(out)).not.toContain('RAW')
    }
  })
  it('routes to the adult model only through the gate', () => {
    expect(decideAdultTurn({ gateAllowed: false, input: '섹스', lastExplicit: true })).toBe(false)
    expect(decideAdultTurn({ gateAllowed: true, input: '안녕', lastExplicit: false })).toBe(false)
    expect(decideAdultTurn({ gateAllowed: true, input: '안녕', lastExplicit: true })).toBe(true)
    expect(decideAdultTurn({ gateAllowed: true, input: '알몸으로', lastExplicit: false })).toBe(true)
  })
})
