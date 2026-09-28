import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { extractJson } from '../ai/orchestrator'

/** 실측 원문 — 다 쓴 답인데 rp 를 닫는 } 하나가 빠졌다 (engine 테스트와 같은 원문). */
const MISSING_CLOSER: string[] = JSON.parse(readFileSync(new URL('../../../engine/src/__tests__/model-quirks.json', import.meta.url), 'utf8')).missingRpCloser

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

  it('closes a bracket the model forgot on a complete reply, only when asked', () => {
    for (const raw of MISSING_CLOSER) {
      expect(extractJson(raw)).toBeNull()
      const v = extractJson(raw, { closeUnclosed: true }) as { rp: { blocks: unknown[]; realityIntent?: unknown } }
      expect(v.rp.blocks.length).toBeGreaterThan(5)
      // 괄호만 채운다 — 안으로 들어간 키를 옮기는 것은 호출자 스키마의 몫이다.
      expect('realityIntent' in v.rp).toBe(true)
    }
    // 끝이 문자열 한가운데면 잘린 것이다 — 닫지 않는다.
    expect(extractJson('{"rp":{"blocks":[{"type":"dialogue","speaker":"유진","text":"말하다가 끊', { closeUnclosed: true })).toBeNull()
    // 앞 블록들은 온전해도 뒤에 잘린 꼬리가 있으면 채우지 않는다(마지막 } 까지만 보면 다 쓴 것처럼 보인다).
    const two = '{"rp":{"blocks":[{"type":"dialogue","text":"하나"},{"type":"dialogue","text":"둘"}'
    expect(extractJson(two + ',{"type":"dialogue","text":"셋은 말하다가', { closeUnclosed: true })).toBeNull()
    expect(extractJson(two + ',', { closeUnclosed: true })).toBeNull()
  })
})
