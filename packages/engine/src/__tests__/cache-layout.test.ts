import { describe, expect, it } from 'vitest'
import { anchoredRecent, buildContext, type RecentMessage } from '../context'
import { snapshot } from './fixtures'

/** n 턴의 대화(사용자·캐릭터 번갈아). 실제처럼 가장 최근 60개만 싣는다. */
const room = (turns: number): RecentMessage[] => Array.from({ length: turns }, (_, t) => [
  { id: `u${t}`, role: 'user' as const, content: `사용자 말 ${t}`, at: `2026-11-16T00:${String(t % 60).padStart(2, '0')}:00` },
  { id: `c${t}`, role: 'character' as const, content: `캐릭터 답 ${t}`, at: `2026-11-16T00:${String(t % 60).padStart(2, '0')}:30` },
]).flat().slice(-60)

describe('cache layout (11/16)', () => {
  it('keeps the legacy layout when not asked', () => {
    const c = buildContext(snapshot({ recentMessages: room(8), turnCount: 8, userInput: '안녕' }))
    expect(c.history).toBeUndefined()
    expect(c.prompt).toContain('## 최근 대화')
  })

  it('moves the recent conversation in front and everything that changes per turn behind it', () => {
    const c = buildContext(snapshot({ recentMessages: room(8), turnCount: 8, userInput: '안녕' }), 1, false, 'scene', true)
    expect(c.history!.length).toBe(16)
    expect(c.history![0]!.startsWith('## 최근 대화\n사용자: 사용자 말 0')).toBe(true)
    expect(c.history!.every(block => block.endsWith('\n'))).toBe(true)
    expect(c.prompt).not.toContain('## 최근 대화')
    expect(c.prompt).toContain('## 이번 턴 지시')
    expect(c.system).not.toContain('## 이번 턴 지시')
    expect(c.cachePrefix).toBe(c.system.length)
  })

  it('moves the start of the window only once every few turns, so earlier blocks stay byte-identical', () => {
    let breaks = 0, previous: string[] | null = null
    for (let turn = 20; turn < 40; turn++) {
      const c = buildContext(snapshot({ recentMessages: room(turn), turnCount: turn, userInput: '다음' }), 1, false, 'scene', true)
      const now = c.history!
      // 기준 개수(30)보다 짧아지지 않는다.
      expect(now.length).toBeGreaterThanOrEqual(30)
      // 앞 턴의 덩이들이 그대로 앞에 있으면 캐시가 걸린다. 첫 덩이는 머리말이 붙어 있어 시작점이 같을 때만 같다.
      if (previous && !previous.every((block, i) => now[i] === block)) breaks++
      previous = now
    }
    expect(breaks).toBeLessThanOrEqual(4)
  })

  it('returns a short room untouched and falls back to the plain window without an anchor', () => {
    const short = room(5)
    expect(anchoredRecent(short, 30, 5)).toBe(short)
    const noUser = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, role: 'narrator' as const, content: `서술 ${i}` }))
    expect(anchoredRecent(noUser, 30, 0).length).toBe(30)
  })
})
