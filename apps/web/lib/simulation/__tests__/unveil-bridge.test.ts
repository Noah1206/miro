import { describe, expect, it, vi } from 'vitest'

vi.mock('@miro/db', () => ({ db: {}, characters: {}, memories: {}, messages: {}, roleplaySessions: {} }))
vi.mock('@/lib/messenger/inbox', () => ({ characterCanSeeMessage: {} }))
vi.mock('@/lib/simulation/mock-llm', () => ({ auxiliaryLLM: vi.fn() }))
vi.mock('@/lib/observe', () => ({ observe: vi.fn() }))

const { sanitizeBridge, bridgePrompt } = await import('../unveil-bridge')

describe('unveil bridge', () => {
  it('passes a narrative-only summary', () => {
    expect(sanitizeBridge('비 오는 밤, 두 사람은 오해를 풀고 서로를 이름으로 부르기 시작했다.')).toMatch(/^비 오는 밤/)
  })
  it('drops summaries with explicit wording (fail closed)', () => {
    expect(sanitizeBridge('두 사람은 침대에서 옷을 벗기며 신음했다.')).toBeNull()
    expect(sanitizeBridge('They had sex.')).toBeNull()
  })
  it('drops empty or tiny output', () => {
    expect(sanitizeBridge('  ')).toBeNull()
  })
  it('labels speakers without leaking ids', () => {
    expect(bridgePrompt('강태준', [{ role: 'user', content: '안녕' }, { role: 'character', content: '왔어?' }])).toContain('사용자: 안녕\n강태준: 왔어?')
  })
})
