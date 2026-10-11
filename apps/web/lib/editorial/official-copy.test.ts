import { describe, expect, it } from 'vitest'
import { officialDescription, officialIntro } from './official-copy'
import original from './seo-ian.fixture.json'
import copy from './official-copy.json'
import { introMessages, sceneOpening, type DialogueEntry } from '@/lib/intro-dialogue'
const entries = original.sample_dialogue as DialogueEntry[]
describe('curated official copy', () => {
  it('keeps author edits and unrelated characters authoritative', () => {
    expect(officialDescription(original)).toContain('라디오에서 듣던 목소리')
    expect(officialDescription({ ...original, personality: '직접 고친 소개' })).toBeNull()
    expect(officialDescription({ ...original, id: 'another-user-character' })).toBeNull()
    expect(officialIntro({ ...original, id: 'another-user-character' }, entries)).toEqual(entries)
    const edited = entries.map(e => e.purpose === 'intro' ? { ...e, text: e.text + ' 직접 편집' } : e)
    expect(officialIntro(original, edited)).toEqual(edited)
  })
  it('shares short openings while retaining samples, scenes and photos', () => {
    const revised = officialIntro(original, entries)
    expect(revised.filter(e => !e.purpose)).toEqual(entries.filter(e => !e.purpose))
    expect([...new Set(revised.filter(e => e.purpose).map(e => e.scene))]).toEqual([...new Set(entries.filter(e => e.purpose).map(e => e.scene))])
    for (const first of entries.filter(e => e.image)) expect(revised.some(e => e.image === first.image && e.scene === first.scene)).toBe(true)
    expect(revised.filter(e => e.purpose === 'intro')).toHaveLength(12)
    expect(entries.filter(e => e.purpose === 'intro')).toHaveLength(14)
  })
  it('copies the selected revised scene into a new session without charging a turn', () => {
    const revised = officialIntro(original, entries)
    const messages = introMessages('new-session', revised, undefined, { scene: '방송국 옥상', userName: '민재' })
    expect(messages.filter(m => m.kind === 'text').map(m => m.content).join(' ')).toContain('한 곡만 같이 들을래요?')
    expect(messages.every(m => m.turnIndex < 0)).toBe(true)
    expect(messages.some(m => m.content.includes('민재'))).toBe(true)
    expect(sceneOpening(revised, '방송국 옥상')?.location).toBe(sceneOpening(entries, '방송국 옥상')?.location)
  })
  it('contains 38 authored openings within editor limits', () => {
    const scenes = Object.values(copy).flatMap(c => [c.intro, ...Object.values(c.scenes)])
    expect(scenes).toHaveLength(38)
    for (const lines of scenes) {
      expect(lines.length).toBeLessThanOrEqual(20)
      expect(lines.reduce((sum, line) => sum + line.length, 0)).toBeLessThanOrEqual(2000)
      expect(lines.every(line => line.trim() && line.length <= 500)).toBe(true)
    }
  })
})
