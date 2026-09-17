import { describe, expect, it } from 'vitest'
import { normalizeLore, selectLore, LORE_LIMITS, type LoreEntry } from '../character/lore'

const e = (keywords: string[], content: string): LoreEntry => ({ keywords, content })

describe('lorebook', () => {
  it('loads an entry only when the turn mentions it', () => {
    const lore = [e(['민준'], '민준은 캐릭터의 사촌 형이다.'), e(['회사'], '캐릭터는 광고 회사에 다닌다.')]
    expect(selectLore(lore, '민준이가 어제 뭐래?').map((x) => x.content)).toEqual(['민준은 캐릭터의 사촌 형이다.'])
    expect(selectLore(lore, '오늘 날씨 좋다')).toEqual([])
  })

  /**
   * 조사는 낱말에 붙어 온다. terms() 는 조사를 완전히 떼지 못하고("민준이가" → "민준이")
   * 한 글자 낱말을 버려서("용" → 없음) 로어 검색에는 쓸 수 없다 — 그래서 부분일치로 찾는다.
   */
  it('finds a keyword regardless of the particle attached to it', () => {
    const lore = [e(['민준'], 'x')]
    for (const q of ['민준이가 왔어', '민준은 어디', '민준한테 물어봐', '민준!', '민준']) {
      expect(selectLore(lore, q), q).toHaveLength(1)
    }
  })

  it('finds one-character keywords too', () => {
    // "용", "형" 처럼 한 글자인 이름·호칭이 한국어에는 흔하다.
    expect(selectLore([e(['용'], '용은 멸종했다.')], '용 봤어?')).toHaveLength(1)
    expect(selectLore([e(['형'], '형은 군대에 있다.')], '형한테 연락했어')).toHaveLength(1)
  })

  it('does not fire on an unrelated turn', () => {
    expect(selectLore([e(['민준'], 'x')], '오늘 점심 뭐 먹지')).toEqual([])
  })

  it('always loads entries with no keywords', () => {
    const lore = [e([], '이 세계에는 마법이 없다.'), e(['용'], '용은 멸종했다.')]
    expect(selectLore(lore, '아무 말')).toEqual([{ keywords: [], content: '이 세계에는 마법이 없다.' }])
    expect(selectLore(lore, '용 봤어?')).toHaveLength(2)
  })

  it('ranks by how many keywords the turn hits, and caps the count', () => {
    const lore = [e(['민준'], 'A'), e(['민준', '형'], 'B'), e(['카페'], 'C'), e(['주말'], 'D'), e(['생일'], 'E')]
    expect(selectLore(lore, '민준 형')[0]!.content).toBe('B')
    expect(selectLore(lore, '민준 형 카페 주말 생일')).toHaveLength(LORE_LIMITS.selected)
  })

  it('drops empty content and clips over-long input', () => {
    const cleaned = normalizeLore([
      { keywords: ['a'], content: '  ' },
      { keywords: ['b', 'b', ' '], content: 'x'.repeat(LORE_LIMITS.content + 50) },
      'not an object',
      { content: '키워드 없는 항목' },
    ])
    expect(cleaned).toHaveLength(2)
    expect(cleaned[0]!.keywords).toEqual(['b'])
    expect(cleaned[0]!.content).toHaveLength(LORE_LIMITS.content)
    expect(cleaned[1]!.keywords).toEqual([])
  })

  it('caps the number of stored entries', () => {
    expect(normalizeLore(Array.from({ length: 100 }, (_, i) => ({ keywords: [`k${i}`], content: `c${i}` })))).toHaveLength(LORE_LIMITS.entries)
    expect(normalizeLore('nope')).toEqual([])
  })
})
