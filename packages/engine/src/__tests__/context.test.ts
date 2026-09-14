import { describe, expect, it } from 'vitest'
import { buildContext } from '../context'
import { character, event, npc, relationship, snapshot } from './fixtures'
import type { Memory } from '@miro/domain'

function memory(sessionId: string, content: string, importance = 0.9): Memory {
  return {
    id: content, sessionId, characterId: 'c1', type: 'user_fact', content,
    importance, persistence: 0.9, confidence: 0.9,
    sourceMessageId: null, createdAt: new Date(),
  }
}

describe('context builder', () => {
  it('puts the starting scene and sample dialogue in the system prompt only when they exist', () => {
    const none = buildContext(snapshot())
    expect(none.system).not.toContain('## 첫 장면')
    expect(none.system).not.toContain('## 말투 예시')

    const s = snapshot()
    s.character.worldRole.startingContext = '검찰청 복도에서 처음 마주쳤다.'
    s.character.worldRole.sampleDialogue = [
      { role: 'narrator', text: '비 내리는 저녁.' },
      { role: 'user', text: '치킨게임할래?' },
      { role: 'character', text: '*서류를 넘기며* 왜 왔지.' },
    ]
    const some = buildContext(s)
    expect(some.system).toContain('## 첫 장면')
    expect(some.system).toContain('검찰청 복도에서 처음 마주쳤다.')
    expect(some.system).toContain('(서술) 비 내리는 저녁.')
    expect(some.system).toContain('유저: 치킨게임할래?')
    expect(some.system).toContain('토마스: *서류를 넘기며* 왜 왔지.')
    // 견본은 정체성(system)에만 — 매 턴 프롬프트에 되풀이하지 않는다
    expect(some.prompt).not.toContain('치킨게임할래?')
  })

  it('keeps character identity in the system prompt, not the turn prompt', () => {
    const c = buildContext(snapshot())
    expect(c.system).toContain('토마스')
    expect(c.system).toContain('거리를 둔다')
    // 성격을 매 턴 재정의하지 않는다
    expect(c.prompt).not.toContain('성격: 거리를 둔다')
  })

  it('carries current world state into the prompt', () => {
    const c = buildContext(snapshot({ world: { ...snapshot().world, currentLocation: '도쿄 호텔' } }))
    expect(c.prompt).toContain('도쿄 호텔')
  })

  it('forbids exposing relationship numbers to the user', () => {
    const c = buildContext(snapshot())
    expect(c.system).toMatch(/관계 수치를.*노출하지/)
    expect(c.prompt).toMatch(/절대 노출하지 말 것/)
  })

  it('translates relationship values into behavioural guidance', () => {
    const distant = buildContext(snapshot({ relationship: relationship({ emotionalDistance: 80 }) }))
    const close = buildContext(snapshot({ relationship: relationship({ emotionalDistance: 15 }) }))
    expect(distant.prompt).toMatch(/거리를 둡니다/)
    expect(close.prompt).toMatch(/편안하게/)
  })

  it('T4: an active event stays in context so it cannot silently vanish', () => {
    const c = buildContext(snapshot({ activeEvents: [event()] }))
    expect(c.prompt).toContain('진행 중인 사건')
    expect(c.prompt).toContain('왼팔 부상')
    expect(c.prompt).toMatch(/해결 전까지 사라지지 않음/)
  })

  it('lists recently resolved events so they are not immediately repeated', () => {
    const c = buildContext(snapshot({
      recentlyResolvedEvents: [event({ type: 'jealousy', status: 'resolved' })],
    }))
    expect(c.prompt).toMatch(/당분간 반복 금지/)
    expect(c.prompt).toContain('jealousy')
  })

  it('never leaks memories from another session', () => {
    const c = buildContext(snapshot({
      memories: [memory('s1', '사용자는 커피를 안 마신다'), memory('OTHER', '다른 세션 기억')],
    }))
    expect(c.prompt).toContain('커피')
    expect(c.prompt).not.toContain('다른 세션 기억')
  })

  it('trims history instead of sending the whole conversation', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      role: 'user' as const, content: `메시지${i}`,
    }))
    const c = buildContext(snapshot({ recentMessages: many }))
    expect(c.prompt).not.toContain('메시지0\n')
    expect(c.prompt).toContain('메시지39')
    expect(c.dropped.some((d) => d.startsWith('messages'))).toBe(true)
  })

  it('bounds npc knowledge in the prompt', () => {
    const c = buildContext(snapshot({ activeNpcs: [npc()] }))
    expect(c.prompt).toContain('이수현')
    expect(c.prompt).toMatch(/아는 정보로만 행동/)
  })

  it('changes output guidance with the selected style', () => {
    const m = buildContext(snapshot({ outputStyle: 'messenger' }))
    const n = buildContext(snapshot({ outputStyle: 'narrative' }))
    expect(m.system).toMatch(/메신저/)
    expect(n.system).toMatch(/서술과 묘사/)
  })

  it('forbids acting on the user\'s behalf', () => {
    expect(buildContext(snapshot()).system).toMatch(/사용자의 행동을 대신 정하지 않습니다/)
  })

  it('forbids following a predetermined plot', () => {
    expect(buildContext(snapshot()).system).toMatch(/정해진 줄거리를 따라가지 않습니다/)
  })

  it('reports an approximate token size', () => {
    expect(buildContext(snapshot()).approxTokens).toBeGreaterThan(0)
  })

  it('personality differences reach the model', () => {
    const jealous = buildContext(snapshot({ character: character({ jealousy: 95 }) }))
    const calm = buildContext(snapshot({ character: character({ jealousy: 5 }) }))
    expect(jealous.system).toContain('질투 성향 95')
    expect(calm.system).toContain('질투 성향 5')
  })
})

describe('call mode context', () => {
  it('switches the style rules to call rules and keeps world/relationship state', () => {
    const c = buildContext(snapshot({ mode: 'voice_call' }))
    expect(c.system).toMatch(/전화 통화 중/)
    expect(c.system).not.toMatch(/출력 스타일/)
    expect(c.prompt).toContain('런던 구시가지')
    expect(c.prompt).toMatch(/절대 노출하지 말 것/)
  })
})
