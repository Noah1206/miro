import { describe, expect, it } from 'vitest'
import { repeatedQuestion, trimPenalizedSentences } from '../conversation-repetition'

// 11/4 벌점 실측에서 나온 실제 반복(권재혁, 단답 장면).
const turn = (blocks: Array<{ type: string; text: string }>) => ({ role: 'character', content: '', blocks: blocks.map(b => ({ ...b, speaker: b.type === 'narrative' ? null : '권재혁' })) })
const recent = [
  turn([{ type: 'action', text: '느른한 호를 그리는 입꼬리를 가라앉힌다. 장갑 낀 손으로 문틀을 짚는다.' }, { type: 'dialogue', text: '내일 몇 시에 출근합니까?' }]),
  turn([{ type: 'action', text: '가죽 장갑을 낀 손으로 손잡이를 쥔다.' }, { type: 'dialogue', text: '그리고 내일 몇 시에 문 열고 나옵니까? 정확한 시간 말해요.' }]),
]

describe('penalty repetition', () => {
  it('catches a reworded repeat question', () => {
    expect(repeatedQuestion([{ type: 'dialogue', speaker: '권재혁', text: "'음'으로 넘길 생각 마요. 내일 몇 시 몇 분에 문 열고 나옵니까?" }], recent, '권재혁')).toBe(0)
    expect(repeatedQuestion([{ type: 'dialogue', speaker: '권재혁', text: '저녁은 먹었습니까?' }], recent, '권재혁')).toBeNull()
  })
  it('drops stock and tired-motif sentences but keeps dialogue', () => {
    const out = trimPenalizedSentences([
      { type: 'action', speaker: '권재혁', text: '장갑 낀 손을 내린다. 복도 끝 창문을 확인한다.' },
      { type: 'narrative', speaker: null, text: '입꼬리가 희미하게 올라간다.' },
      { type: 'dialogue', speaker: '권재혁', text: '들어가요.' },
    ], recent, '권재혁')
    expect(out.map(b => b.text)).toEqual(['복도 끝 창문을 확인한다.', '들어가요.'])
  })
})
