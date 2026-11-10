import { describe, expect, it } from 'vitest'
import { officialDescription, officialEntry, officialIntro, officialStartingContext } from './official-copy'
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
  it('adds world and player context while retaining samples, scenes and photos', () => {
    const revised = officialIntro(original, entries)
    expect(revised.filter(e => !e.purpose)).toEqual(entries.filter(e => !e.purpose))
    expect([...new Set(revised.filter(e => e.purpose).map(e => e.scene))]).toEqual([...new Set(entries.filter(e => e.purpose).map(e => e.scene))])
    for (const first of entries.filter(e => e.image)) expect(revised.some(e => e.image === first.image && e.scene === first.scene)).toBe(true)
    expect(revised.filter(e => e.purpose === 'intro')).toHaveLength(18)
    expect(entries.filter(e => e.purpose === 'intro')).toHaveLength(14)
  })
  it('copies the selected revised scene into a new session without charging a turn', () => {
    const revised = officialIntro(original, entries)
    const messages = introMessages('new-session', revised, undefined, { scene: '방송국 옥상', userName: '민재' })
    expect(messages.filter(m => m.kind === 'text').map(m => m.content).join(' ')).toContain('한 곡만 같이 들을래요?')
    expect(messages.every(m => m.turnIndex < 0)).toBe(true)
    expect(messages.filter(m => m.kind === 'text').at(-1)?.role).toBe('character')
    expect(messages.some(m => m.content.includes('당신'))).toBe(true)
    expect(messages.some(m => m.content.includes('민재'))).toBe(false)
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


describe('유저가 참여하는 도입부 편집', () => {
  it('puts all 38 scene openings in the user situation and ends with a character invitation', () => {
    for (const edition of Object.values(copy)) for (const lines of [edition.intro, ...Object.values(edition.scenes)]) {
      expect(lines).toHaveLength(4)
      expect(lines[0]).toContain('당신')
      expect(lines[1]!.trim().length).toBeGreaterThan(8)
      expect(lines[3]!.trim().length).toBeGreaterThan(15)
      expect(lines.join(' ')).not.toMatch(/당신은 (?:놀랐다|당황했다|두려웠다)|당신의 마음/)
    }
  })
  it('only replaces the exact authored context, leaving independent edits and private data intact', () => {
    expect(officialStartingContext({ ...original, startingContext: original.starting_context })).toContain(copy['official-seo-ian'].startingContext)
    const c = Object.values(copy).find(c => 'startingContext' in c)!
    const slug = Object.keys(copy).find(slug => copy[slug as keyof typeof copy].id === c.id)!
    expect(officialStartingContext({ id: c.id, slug, startingContext: '직접 고친 시작 상황' })).toBe('직접 고친 시작 상황')
    expect(officialStartingContext({ id: 'other', slug, startingContext: null })).toBeNull()
  })
})


describe('scene-specific entry briefing', () => {
  it('keeps the remote scene remote instead of using the default convenience-store meeting', () => {
    const entry = officialEntry(original, entries, '방송 중 사연')!
    expect(entry.role).toContain('집에서')
    const revised = officialIntro(original, entries)
    const context = sceneOpening(revised, '방송 중 사연')!.context!
    expect(context).toContain(entry.role)
    expect(context).not.toContain('지금은 새벽 4시 10분')
    const history = introMessages('broadcast-session', revised, undefined, { scene: '방송 중 사연' })
    expect(history.some(m => m.content.includes(entry.before))).toBe(true)
    expect(history.at(-1)?.role).toBe('character')
  })
  it('never layers a curated player premise onto an author-edited opening', () => {
    const edited = entries.map(e => e.purpose === 'intro' ? { ...e, text: e.text + ' 작가가 변경한 상황' } : e)
    expect(officialEntry(original, edited)).toBeNull()
    expect(officialEntry({ ...original, id: 'unrelated' }, entries)).toBeNull()
  })
})
