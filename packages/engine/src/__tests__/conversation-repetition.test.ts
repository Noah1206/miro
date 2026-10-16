import { describe, expect, it } from 'vitest'
import { repeatedConversationBlock } from '../conversation-repetition'

const previous = (text: string, type = 'dialogue') => ({ role: 'character', content: text, blocks: [{ type, text }] })
describe('substantial repeated character text', () => {
  it('catches recycled questions and whitespace changes before delivery', () => {
    const text = '내일 발표에서 제일 걱정되는 부분이 어떤 건지 말해 줄래?'
    expect(repeatedConversationBlock([{ type: 'dialogue', text }], [previous(text.replaceAll(' ', '  '))])).toBe(0)
  })
  it('catches a recurring memory announcement without banning its first use', () => {
    const block = [{ type: 'dialogue', text: '그건 꼭 기억해 둘게. 이번에는 내가 골라 볼까?' }]
    expect(repeatedConversationBlock(block, [previous('생수 기억해 둘게.'), previous('별명은 안 부를게. 기억해 둘게.')])).toBe(0)
    expect(repeatedConversationBlock(block, [])).toBeNull()
    expect(repeatedConversationBlock(block, [previous('기억해 둘게.')], '기억해 줘.')).toBeNull()
  })
  it('catches an immediately recycled short question without banning brief dialect', () => {
    expect(repeatedConversationBlock([{ type: 'dialogue', text: '오늘 밥은 먹었어요?' }], [previous('오늘 밥은 먹었어요?')], '응, 김밥 먹었어.')).toBe(0)
    expect(repeatedConversationBlock([{ type: 'dialogue', text: '알았제?' }], [previous('알았제?')], '응.')).toBeNull()
  })
  it('preserves short greetings, dialect, changed replies and requested repetition', () => {
    expect(repeatedConversationBlock([{ type: 'dialogue', text: '알았제?' }], [previous('알았제?')])).toBeNull()
    const text = '먼저 숨을 고르고 첫 문장만 천천히 읽어 봐.'
    expect(repeatedConversationBlock([{ type: 'dialogue', text }], [previous(text)], '똑같이 다시 말해 줘.')).toBeNull()
    expect(repeatedConversationBlock([{ type: 'dialogue', text: '나는 오늘은 바깥 산책보다 책방 구경이 하고 싶어.' }], [previous(text)])).toBeNull()
    expect(repeatedConversationBlock([{ type: 'dialogue', text }], [{ role: 'user', content: text }])).toBeNull()
  })
  it('does not borrow another speaker’s line as this character’s previous reply', () => {
    const text = '오늘 밥은 먹었어요?'
    expect(repeatedConversationBlock([{ type: 'dialogue', speaker: '토마스', text }], [{ role: 'character', content: text,
      blocks: [{ type: 'dialogue', speaker: '다른 인물', text }] }], '', '토마스')).toBeNull()
  })
})
