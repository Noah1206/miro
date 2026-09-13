import { describe, expect, it } from 'vitest'
import { buildMediaKey, buildVisualPrompt, type PhotoContext } from '../media/keys'
import type { CharacterVisualIdentity } from '../character/types'

const identity: CharacterVisualIdentity = {
  id: 'v1', characterId: 'c1', version: 1,
  baseFace: { jaw: 'angular', eyes: 'narrow' },
  bodyProfile: { height: 'tall', build: 'slim' },
  hair: { style: 'short', color: 'black' },
  styleTags: ['minimal', 'dark'],
  expressionTendency: 'reserved',
  outfitProfile: { top: 'black coat' },
  referenceSource: 'text',
}

const ctx = (over: Partial<PhotoContext> = {}): PhotoContext => ({
  location: 'Tokyo Hotel', time: 'night', mood: 'tense', outfit: '', visualVersion: 1, ...over,
})

describe('media cache key', () => {
  it('T7: identical world state yields the same key, so no regeneration', () => {
    expect(buildMediaKey('photo', ctx())).toBe(buildMediaKey('photo', ctx()))
  })

  it('a different location yields a different key', () => {
    expect(buildMediaKey('photo', ctx()))
      .not.toBe(buildMediaKey('photo', ctx({ location: 'Seoul Office' })))
  })

  it('changing the visual identity invalidates the cache', () => {
    expect(buildMediaKey('photo', ctx({ visualVersion: 1 })))
      .not.toBe(buildMediaKey('photo', ctx({ visualVersion: 2 })))
  })

  it('photo and background do not share a cache entry', () => {
    expect(buildMediaKey('photo', ctx())).not.toBe(buildMediaKey('background', ctx()))
  })

  it('normalizes casing and spacing so cache hits are not missed', () => {
    expect(buildMediaKey('photo', ctx({ location: 'Tokyo  Hotel' })))
      .toBe(buildMediaKey('photo', ctx({ location: 'tokyo hotel' })))
  })
})

describe('visual prompt', () => {
  it('carries the same identity into every media kind', () => {
    const photo = buildVisualPrompt({ identity, characterName: '토마스', context: ctx(), kind: 'photo' })
    const live = buildVisualPrompt({ identity, characterName: '토마스', context: ctx(), kind: 'live_scene' })
    expect(photo).toContain('angular')
    expect(live).toContain('angular')
    expect(photo).toBe(live)   // 기능마다 다른 외형이 나오지 않는다
  })

  it('T7: the prompt reflects current world state', () => {
    const p = buildVisualPrompt({
      identity, characterName: '토마스',
      context: ctx({ location: 'Tokyo Hotel' }), kind: 'photo',
    })
    expect(p).toContain('Tokyo Hotel')
    expect(p).not.toContain('Seoul')
  })

  it('leaves people out of a background so it works as a chat backdrop', () => {
    const bg = buildVisualPrompt({ identity, characterName: '토마스', context: ctx(), kind: 'background' })
    expect(bg).toContain('no people')
    expect(bg).not.toContain('angular')
  })

  it('includes hair, build, and outfit from the identity', () => {
    const p = buildVisualPrompt({ identity, characterName: '토마스', context: ctx(), kind: 'photo' })
    expect(p).toMatch(/hair/)
    expect(p).toMatch(/build/)
    expect(p).toMatch(/black coat/)
  })
})

describe('body build in the prompt', () => {
  it('turns the build enum into its written description, not the raw key', () => {
    const p = buildVisualPrompt({
      identity: { ...identity, bodyProfile: { build: 'muscular', height: '187cm', detail: null } },
      characterName: '토마스', context: ctx(), kind: 'photo',
    })
    expect(p).toContain('muscular athletic build')
    expect(p).not.toContain('build muscular')   // 키를 그대로 흘리지 않는다
    expect(p).toContain('187cm')
  })

  it('keeps a muscular physique readable through clothing', () => {
    const p = buildVisualPrompt({
      identity: { ...identity, bodyProfile: { build: 'muscular', height: null, detail: null } },
      characterName: '토마스', context: ctx({ outfit: 'wearing a wool coat' }), kind: 'photo',
    })
    expect(p).toContain('through clothing')
    expect(p).toContain('wearing a wool coat')
  })

  it('gives each build its own description', () => {
    const of = (build: 'slim' | 'average' | 'muscular' | 'heavy') => buildVisualPrompt({
      identity: { ...identity, bodyProfile: { build, height: null, detail: null } },
      characterName: 'x', context: ctx(), kind: 'photo',
    })
    const all = [of('slim'), of('average'), of('muscular'), of('heavy')]
    expect(new Set(all).size).toBe(4)
  })

  it('names the gender before the build, so the model does not default to a man', () => {
    const p = buildVisualPrompt({
      identity: { ...identity, bodyProfile: { build: 'muscular', gender: 'female', height: null, detail: null } },
      characterName: 'x', context: ctx(), kind: 'photo',
    })
    expect(p).toContain('woman')
    // 'muscular' 만 주면 모델이 대개 남성을 그린다 — 성별이 먼저 와야 한다.
    expect(p.indexOf('woman')).toBeLessThan(p.indexOf('muscular'))
  })

  it('omits the gender when it was never chosen', () => {
    const p = buildVisualPrompt({
      identity: { ...identity, bodyProfile: { build: 'slim', height: null, detail: null } },
      characterName: 'x', context: ctx(), kind: 'photo',
    })
    expect(p).not.toContain('woman')
    expect(p).not.toContain(', man,')
  })

  it('still builds a prompt when appearance is empty', () => {
    const empty: CharacterVisualIdentity = {
      ...identity, baseFace: {}, bodyProfile: {}, hair: {}, styleTags: [], expressionTendency: null,
    }
    expect(() => buildVisualPrompt({ identity: empty, characterName: 'x', context: ctx(), kind: 'photo' })).not.toThrow()
  })
})
