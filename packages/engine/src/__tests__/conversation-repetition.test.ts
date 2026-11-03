import { describe, expect, it } from 'vitest'
import { repeatedConversationBlock, repeatedEnding } from '../conversation-repetition'

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
  it('does not confuse a request to stop repeating with permission to repeat', () => {
    const text = '내일 발표에서 제일 걱정되는 부분이 어떤 건지 말해 줄래?'
    expect(repeatedConversationBlock([{ type: 'dialogue', text }], [previous(text)], '그 말 다시 말하지 마.')).toBe(0)
  })
})

// 11/3 맥락 실측의 실제 마무리들.
describe('reworded repeated ending', () => {
  const last = [previous('자, 이제 내려요. 우산 펴고 오른쪽에 붙어서. 열두 걸음입니다.'), previous('우산 펴고 내려요. 오른쪽에 붙어서. 열두 걸음, 내가 앞에서 속도 맞춥니다.')]
  it('flags the same instruction reworded across turns', () => {
    expect(repeatedEnding([{ type: 'narrative', text: '빗소리.' }, { type: 'dialogue', text: '우산 펴고 내려요. 열두 걸음, 내 오른쪽 한 발 뒤.' }], last)).toBe(1)
  })
  it('flags an every-other-turn reworded ending (Gemini)', () => {
    const gemini = [previous('엉뚱한 생각 그만하고 가방 챙겨요. 나가서 문 열 테니까 딴 데 보지 말고 바로 내립니다.'), previous('당장 내릴 준비 해요.'),
      previous('쓸데없는 소리로 정신 팔지 말고 가방이나 제대로 챙겨요. 나가서 조수석 문 열어줄 테니까 내릴 준비만 하고 있습니다.'), previous('주말이고 친구고 다 나중 일입니다.')]
    expect(repeatedEnding([{ type: 'dialogue', text: '딴생각하지 말고 가방 챙겨요. 문 열어줄 테니까 바로 내립니다.' }], gemini)).toBe(0)
  })
  it('allows a new ending and a one-off echo', () => {
    expect(repeatedEnding([{ type: 'dialogue', text: '진술 끝나면 저녁은 내가 사죠. 짜지 않은 걸로.' }], last)).toBeNull()
    expect(repeatedEnding([{ type: 'dialogue', text: '우산 펴고 내려요. 열두 걸음, 내 오른쪽 한 발 뒤.' }], last.slice(0, 1))).toBeNull()
  })
})
