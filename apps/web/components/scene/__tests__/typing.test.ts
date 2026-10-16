import { describe, expect, it } from 'vitest'
import { TYPING_MS_PER_CHAR, MAX_PARAGRAPH_MS, MIN_TICK_MS, REPLY_TYPING_PACE, charsPerTick, msPerChar, pauseAfter } from '../typing'

describe('typing rhythm', () => {
  it('types slower when the character is hurt than when angry', () => {
    // 상한 사람은 느리게 치고, 화난 사람은 쏘아붙인다.
    expect(TYPING_MS_PER_CHAR.hurt).toBeGreaterThan(TYPING_MS_PER_CHAR.neutral)
    expect(TYPING_MS_PER_CHAR.angry).toBeLessThan(TYPING_MS_PER_CHAR.neutral)
  })

  it('keeps even a long narration inside the cap', () => {
    const long = '가'.repeat(400)
    expect(long.length * msPerChar(long, 'hurt')).toBeLessThanOrEqual(MAX_PARAGRAPH_MS + 1)
    // 짧은 대사는 기분 그대로의 속도를 쓴다.
    expect(msPerChar('응.', 'hurt')).toBe(TYPING_MS_PER_CHAR.hurt)
  })

  it('never returns a speed that would stall the line', () => {
    // 글자당 시간은 0 보다 크고, 한 틱(여러 글자)은 타이머 최소 간격 아래로 내려가지 않는다.
    for (const mood of Object.keys(TYPING_MS_PER_CHAR) as Array<keyof typeof TYPING_MS_PER_CHAR>) {
      const speed = msPerChar('가'.repeat(2000), mood)
      expect(speed).toBeGreaterThan(0)
      expect(speed * charsPerTick(speed)).toBeGreaterThanOrEqual(MIN_TICK_MS)
    }
    expect(charsPerTick(TYPING_MS_PER_CHAR.neutral)).toBe(1)
  })

  it('pauses longest after an ellipsis — hesitation is silence, not words', () => {
    expect(pauseAfter('…', ' ', 'neutral')).toBeGreaterThan(pauseAfter('.', ' ', 'neutral'))
    expect(pauseAfter('.', ' ', 'neutral')).toBeGreaterThan(pauseAfter(',', ' ', 'neutral'))
    expect(pauseAfter('가', '나', 'neutral')).toBe(0)
  })

  it('does not pause inside a run of dots', () => {
    // "..." 한가운데서 멈추면 세 번 끊긴다.
    expect(pauseAfter('.', '.', 'neutral')).toBe(0)
    expect(pauseAfter('…', '…', 'neutral')).toBe(0)
  })

  it('stretches the pauses for a hurt character', () => {
    expect(pauseAfter('…', ' ', 'hurt')).toBeGreaterThan(pauseAfter('…', ' ', 'angry'))
  })

  // 10/17 사용자: 캐릭터챗 답은 뭉텅이가 아니라 한 글자씩 — 압축 없이 일정한 속도로, 끊는 자리는 문장 끝뿐.
  it('types a long chat reply one character per tick and pauses only at sentence ends', () => {
    const long = '가'.repeat(600)
    const speed = msPerChar(long, 'neutral', REPLY_TYPING_PACE, Infinity)
    expect(speed).toBe(TYPING_MS_PER_CHAR.neutral * REPLY_TYPING_PACE)
    expect(charsPerTick(speed)).toBe(1)
    expect(charsPerTick(msPerChar(long, 'angry', REPLY_TYPING_PACE, Infinity))).toBe(1)
    expect(pauseAfter(',', ' ', 'neutral', true)).toBe(0)
    expect(pauseAfter('\n', '가', 'neutral', true)).toBe(0)
    expect(pauseAfter('.', ' ', 'neutral', true)).toBeGreaterThan(0)
    expect(pauseAfter('?', ' ', 'neutral', true)).toBeGreaterThan(0)
  })
})
