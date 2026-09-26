import { describe, expect, it } from 'vitest'
import { buildContext, buildSpokenSystem } from '../context'
import { character, event, npc, relationship, snapshot } from './fixtures'
import type { Memory } from '@miro/domain'
import { POLICY } from '@miro/config'

function memory(sessionId: string, content: string, importance = 0.9): Memory {
  return {
    id: content, sessionId, characterId: 'c1', type: 'user_fact', content,
    importance, persistence: 0.9, confidence: 0.9,
    tags: [], sourceMessageId: null, createdAt: new Date(),
  }
}

describe('context builder', () => {
  it('preserves authored identity and appearance without deriving personality from labels', () => {
    const s = snapshot()
    s.character.personality.userNickname = '선배'
    s.character.worldRole.socialPosition = '폐역의 관리자'
    s.character.appearance = { baseFace: { distinctive: '왼쪽 눈썹 흉터' }, hair: { color: '은색' },
      bodyProfile: { height: '178cm' }, styleTags: ['단정함'], expressionTendency: '잘 웃지 않음', outfitProfile: {} }
    const { system } = buildContext(s)
    for (const fact of ['국적 (작성된 사실): 영국', 'MBTI (작성자의 참고 설정): INTJ', '사용자를 부르는 호칭: 선배',
      '세계 안에서의 위치: 폐역의 관리자', '왼쪽 눈썹 흉터', '은색', '178cm']) expect(system).toContain(fact)
    expect(system).toContain('국적·MBTI·외형으로 성격, 신념, 능력, 취향을 추정하지 않습니다')
    const noAppearance = buildContext(snapshot())
    expect(noAppearance.system).not.toContain('외형 설정 (관련 장면에서만 참고)')
  })

  it('does not attribute narrator or NPC messages to the character and keeps their source', () => {
    const { system, prompt } = buildContext(snapshot({ recentMessages: [
      { role: 'narrator', content: '그가 모르는 곳에 편지가 숨겨져 있다.', id: 'narration-1', kind: 'text', at: '2026-09-24T01:00:00Z', knowledgeScope: 'omniscient' },
      { role: 'npc', npcName: '서연', content: '문은 잠겼어요.', id: 'npc-1' },
      { role: 'character', kind: 'reality_message', content: '도착하면 알려 줘.' },
      { role: 'character', content: '안녕. MIXED_NARRATION', blocks: [
        { type: 'dialogue', speaker: '토마스', text: '안녕.' },
        { type: 'narrative', text: 'MIXED_NARRATION' },
      ] },
    ] }))
    expect(prompt).toContain('내레이터 (전지적 서술 · 캐릭터 지식 아님): 그가 모르는 곳')
    expect(prompt).toContain('NPC (서연): 문은 잠겼어요.')
    expect(prompt).not.toContain('토마스: 그가 모르는 곳')
    expect(prompt).not.toContain('토마스: 문은 잠겼어요.')
    expect(prompt).toContain('narration-1')
    expect(prompt).toContain('2026-09-24T01:00:00Z')
    expect(prompt).toContain('reality_message')
    expect(prompt).toContain('내레이터 (전지적 서술 · 캐릭터 지식 아님): MIXED_NARRATION')
    expect(prompt).not.toContain('토마스: 안녕. MIXED_NARRATION')
    expect(system).toContain('직접 관찰하거나 전달받은 근거가 없는 비밀')
  })

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

  it('writes a full multi-beat scene for every chat reply, even a one-word input', () => {
    const m = buildContext(snapshot({ userInput: '뭐해' }))
    const n = buildContext(snapshot({ userInput: '*창밖을 오래 바라보다가* 오늘은 왠지 네 생각이 많이 났어. 이유는 모르겠는데, 그냥 그랬어.' }))
    // 9/24 실측: 짧은 입력에 "한 줄씩" 규칙을 주면 답이 3블록·100자 안팎에 머물렀다. 길이는 입력이 아니라 장면이 정한다.
    expect(m.system).not.toMatch(/상황 한 줄, 속마음 한 줄/)
    for (const c of [m, n]) {
      expect(c.system).toMatch(/한 단어만 보내도 장면을 충분히 펼칩니다/)
      expect(c.system).toMatch(/블록 5~8개, 전체 500~900자/)
      // 계약의 예시가 대사 한 블록이면 모델도 한 블록으로 답한다 — 장면의 박자를 보여 준다.
      expect(c.system).toContain('{"type":"narrative","speaker":null,"text":"scene"},{"type":"action","speaker":"토마스"')
    }
    expect(n.system).toMatch(/서술과 묘사를 충분히/)
    for (const c of [m, n]) expect(c.system).toMatch(/thought 블록은 이 캐릭터 자신의 말하지 않은 속마음/)
    // A reality character's chat is the in-person scene; its messages and calls live in the Reality layer.
    const met = buildContext(snapshot({ userInput: '뭐해', experienceType: 'reality' }))
    expect(met.system).toMatch(/직접 만나 같은 공간에 있는 장면/)
    expect(met.promptVersion).toBe('dialogue:v1+scene-beats+in-person')
    expect(m.system).not.toMatch(/직접 만나 같은 공간/)
    // A call is the reality layer: spoken words only, no narration or inner voice.
    expect(buildContext(snapshot({ userInput: '뭐해', mode: 'voice_call' })).system).not.toMatch(/thought 블록/)
  })

  it('keeps the agency renderer on the measured brief directive', () => {
    // 자율성 엔진의 검증기는 모든 서술에 근거를 요구한다 — 근거 없는 긴 장면 지시를 주지 않는다.
    const c = buildContext(snapshot({ userInput: '뭐해' }), 1, false, 'brief')
    expect(c.system).toMatch(/상황 한 줄, 속마음 한 줄/)
    expect(c.system).not.toMatch(/500~900자/)
    expect(c.system).toContain('{"type":"dialogue","speaker":"character name","text":"response"}')
    expect(c.promptVersion).toBe('dialogue:v1+scene-thought')
  })

  it('puts a character name with $ into the contract literally', () => {
    const c = buildContext(snapshot({ character: { ...snapshot().character, identity: { ...snapshot().character.identity, name: "Neo$'" } } }))
    expect(c.system).toContain(`"speaker":"Neo$'","text":"gesture"`)
  })

  it('shows past inner voice as unspoken, not as something the user heard', () => {
    const c = buildContext(snapshot({ recentMessages: [{ role: 'character', content: '응.',
      blocks: [{ type: 'thought', speaker: '토마스', text: '사실 기다렸다.' }, { type: 'dialogue', speaker: '토마스', text: '응.' }] }] }))
    expect(c.prompt).toContain('속마음 (토마스, 소리 내어 말하지 않음): 사실 기다렸다.')
  })

  it('weights the scene when an event or emotion is active', () => {
    const c = buildContext(snapshot({ userInput: '응', activeEvents: [event()] }))
    expect(c.system).toMatch(/행동과 환경 반응/)
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

  /** ECHO 는 같은 모델에 맥락을 더 넣는다. */
  it('an ECHO turn carries more of the conversation than a MIRO turn', () => {
    const recentMessages = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'character' as const : 'user' as const, content: `대화 ${i}` }))
    const memories = Array.from({ length: 20 }, (_, i) => memory('s1', `기억 ${i}`, 0.9))
    const s = snapshot({ recentMessages, memories })

    const miro = buildContext(s, 1)
    const echo = buildContext(s, 2)
    const kept = (c: { prompt: string }) => recentMessages.filter(m => c.prompt.includes(m.content)).length
    expect(kept(echo)).toBeGreaterThan(kept(miro))
    expect(echo.approxTokens).toBeGreaterThan(miro.approxTokens)
  })

  it('a larger ECHO context still respects the token budget', () => {
    // 예산을 넘길 만큼 긴 대화에서도 단계적 축소가 그대로 동작한다.
    const recentMessages = Array.from({ length: 200 }, (_, i) => ({ role: 'user' as const, content: `아주 긴 대화 내용입니다 ${i} `.repeat(20) }))
    const echo = buildContext(snapshot({ recentMessages }), 4)
    expect(echo.approxTokens).toBeLessThanOrEqual(POLICY.context.maxTokens)
    expect(echo.dropped.join(',')).toContain('messages')
  })


  // 실시간 음성은 소리로 나간다 — JSON 계약·상태 변화 제안이 실리면 모델이 그 형식을 말하려 한다.
  // 대신 턴마다 프롬프트를 받지 않으므로 최근 대화·장소가 지시문 안에 있어야 한다.
  it('the spoken system carries the scene and recent talk, never the JSON contract', () => {
    const s = snapshot({ recentMessages: [{ id: 'm1', role: 'user', content: '내일 공방에 다시 올게요', at: new Date().toISOString(), knowledgeScope: 'participant' }] })
    const spoken = buildSpokenSystem(s)
    expect(spoken).toContain('내일 공방에 다시 올게요')
    expect(spoken).toContain(s.world.currentLocation)
    expect(spoken).toContain(s.character.identity.name)
    for (const leak of ['JSON', 'relationshipDelta', 'eventUpdates', 'Block type']) expect(spoken).not.toContain(leak)
    expect(buildContext(s).system).toContain('JSON')
  })
})

describe('messenger mode', () => {
  it('replaces the in-person scene directive with messenger rules and marks the prompt version', () => {
    const s = snapshot({ experienceType: 'reality', mode: 'messenger' })
    const built = buildContext(s)
    expect(built.system).toContain('메신저(문자) 대화')
    expect(built.system).not.toContain('직접 만나 같은 공간에 있는 장면')
    expect(built.promptVersion).toContain('+messenger')
    expect(built.promptVersion).not.toContain('+in-person')
    // 문자는 상태 변화 제안(JSON 계약)을 그대로 쓴다 — 통화처럼 소리로 나가는 것이 아니다.
    expect(built.system).toContain('반드시 지정된 JSON 스키마')
    // 문자는 대사만 오간다 — 장면 박자 예시와 분량 규칙을 싣지 않는다.
    expect(built.system).not.toContain('"type":"narrative"')
    expect(built.system).not.toMatch(/500~900자/)
  })
})

describe('real clock', () => {
  it('tells the character the user-local time and that the world day follows it', () => {
    const { prompt } = buildContext(snapshot({ clock: { iso: '2026-09-26T14:10:00Z', timeZone: 'Asia/Seoul', label: '2026-09-26 (토) 23:10', weekday: 6, hour: 23, minute: 10, period: '밤' } }))
    expect(prompt).toContain('현실 시각(사용자 기준, Asia/Seoul): 2026-09-26 (토) 23:10 · 밤')
    expect(buildContext(snapshot()).prompt).not.toContain('현실 시각')
  })
})
