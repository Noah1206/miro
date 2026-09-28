import { describe, expect, it } from 'vitest'
import { TYPING_MS_PER_CHAR, MAX_PARAGRAPH_MS, MAX_REPLY_MS, msPerChar, pauseAfter, replyPace } from '../typing'

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
    for (const mood of Object.keys(TYPING_MS_PER_CHAR) as Array<keyof typeof TYPING_MS_PER_CHAR>) {
      expect(msPerChar('가'.repeat(2000), mood)).toBeGreaterThanOrEqual(8)
    }
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

  it('speeds up a whole scene so a long reply does not take half a minute', () => {
    // 짧은 응답은 기분 그대로 친다.
    expect(replyPace(3)).toBe(1)
    // 문단 7개짜리 장면은 각 문단 상한을 모두 채워도 전체 상한 안에 든다.
    const pace = replyPace(7)
    expect(pace).toBeLessThan(1)
    const long = '가'.repeat(300)
    expect(7 * long.length * msPerChar(long, 'neutral', pace)).toBeLessThanOrEqual(MAX_REPLY_MS + 7)
  })
})
