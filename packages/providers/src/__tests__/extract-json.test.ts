import { describe, expect, it } from 'vitest'
import { extractJson } from '../ai/orchestrator'

/** 실측 원문 그대로 — 모델이 rp 를 닫고 `]` 를 하나 더 뱉는다. 20턴 중 7턴이 이걸로 버려졌다. */
const STRAY_BRACKET = '{"rp":{"blocks":[{"type":"dialogue","speaker":"유진","text":"…고양이까지 데리고 갔다고? 거기가 무슨 동물농장이야?"},{"type":"action","speaker":"유진","text":"휴대폰 화면을 빤히 내려다보다가 손가락을 톡톡 두드린다."},{"type":"dialogue","speaker":"유진","text":"이사는 혼자 해놓고 짐만 늘렸네. 좁아 터진 데서 잘도 버티겠다."}]}],"worldDelta":null,"relationshipDelta":null,"sceneDelta":null,"memoryCandidates":[],"eventCandidates":[],"eventUpdates":[],"npcIntroductions":[],"npcActions":[],"realityIntent":null}'

describe('extractJson', () => {
  it('parses clean JSON and fenced JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('recovers the reply when the model leaves a stray closing bracket', () => {
    const v = extractJson(STRAY_BRACKET) as { rp: { blocks: unknown[] }; realityIntent: unknown }
    expect(v).not.toBeNull()
    expect(v.rp.blocks).toHaveLength(3)
    expect(v.realityIntent).toBeNull()
  })

  it('also recovers the extraction shape {"memories":[…]}]', () => {
    const v = extractJson('{"memories":[{"type":"user_fact","content":"x","importance":0.8,"persistence":0.8,"confidence":0.9}]]}') as { memories: unknown[] }
    expect(v.memories).toHaveLength(1)
  })

  it('never touches brackets inside strings', () => {
    const v = extractJson('{"text":"괄호 ] 와 } 가 들어간 대사","n":1}]') as { text: string; n: number }
    expect(v).toEqual({ text: '괄호 ] 와 } 가 들어간 대사', n: 1 })
    const esc = extractJson('{"text":"따옴표 \\" 다음 ]","n":2}]') as { text: string }
    expect(esc.text).toBe('따옴표 " 다음 ]')
  })

  it('does not invent missing openers — truncated output still fails', () => {
    // 잘린 출력을 지어내 완성하면 반쪽 대사가 저장된다. 그건 여기서 고칠 문제가 아니다.
    expect(extractJson('{"rp":{"blocks":[{"type":"dialogue","speaker":"유진","text":"말하다가 끊')).toBeNull()
    expect(extractJson('not json at all')).toBeNull()
  })
})
