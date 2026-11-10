import { describe, expect, it } from 'vitest'
import { editorialHeading, editorialLines } from '../editorial-text'
import { SEEDS } from '../../../scripts/bl-characters.data.mjs'
import { SEEDS_2 as SECOND_SEEDS } from '../../../scripts/bl-characters-2.data.mjs'

const content = (text: string) => text.replace(/\s+\/\s+/g, '').replace(/\s/g, '')

describe('editorial character descriptions', () => {
  it('preserves the public copy of every official character while adding paragraphs', () => {
    const seeds = [...SEEDS, ...SECOND_SEEDS]
    expect(seeds.length).toBe(14)
    for (const seed of seeds) {
      for (const text of [seed.personality, seed.world.worldSetting, seed.startingContext, ...seed.sampleDialogue.map(d => d.text)]) {
        const lines = editorialLines(text)
        expect(content(lines.join('\n')), seed.slug).toBe(content(text))
      }
      expect(editorialLines(seed.personality).length, seed.slug).toBeGreaterThan(seed.personality.split('\n').length)
    }
  })

  it('keeps quoted speech, decimal numbers and parenthetical notes intact', () => {
    const text = '그는 "문을 잠그세요. 밖으로 나가지 마세요."라고 말했다. 키는 188.5cm다. 그가 머무는 저택(서울. 한남동.)은 담장이 높고, 밤마다 비 내리는 정원에서 같은 사람의 연락을 기다린다. 대문이 닫혔다.'
    const result = editorialLines(text).join('\n')
    expect(result).toContain('"문을 잠그세요. 밖으로 나가지 마세요."라고 말했다.')
    expect(result).toContain('188.5cm')
    expect(result).toContain('(서울. 한남동.)')
    expect(content(result)).toBe(content(text))
  })

  it('respects author line breaks and emphasis, and keeps bullet continuations together', () => {
    expect(editorialLines('[프로필]\n짧은 소개.\n\n[당신]\n· 직접 적은 줄.')).toEqual(['[프로필]', '짧은 소개.', '', '[당신]', '· 직접 적은 줄.'])
    const bullet = '· 당신은 사건의 유일한 목격자다. ' + '그는 당신을 지켜야 할 사람으로 정했고, 그 이유를 아직 누구에게도 설명하지 않았다. '.repeat(3)
    expect(editorialLines(bullet)).toHaveLength(1)
    expect(editorialLines(bullet)[0]).toContain('\n')
    const emphasis = '**' + '아주 긴 강조 문장. '.repeat(15) + '**'
    expect(editorialLines(emphasis)).toEqual([emphasis])
  })

  it('uses limited heading colors and decorative icons', () => {
    expect(editorialHeading('프로필')).toEqual({ icon: '🪪', tone: 'brand' })
    expect(editorialHeading('당신')).toEqual({ icon: '💬', tone: 'mint' })
    expect(editorialHeading('직접 쓴 소제목')).toEqual({ icon: '✦', tone: 'brand' })
  })
})
