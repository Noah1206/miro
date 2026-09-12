import { describe, expect, it } from 'vitest'
import { buildSceneKey } from '../scene/types'

describe('scene cache key', () => {
  it('T7: the same world state produces the same key (no silent background drift)', () => {
    const tokyo = { location: 'Tokyo Hotel', time: 'night', mood: 'tense', weather: 'rain' }
    expect(buildSceneKey(tokyo)).toBe(buildSceneKey({ ...tokyo }))
  })

  it('a different location produces a different key', () => {
    const tokyo = buildSceneKey({ location: 'Tokyo Hotel', time: 'night', mood: 'tense', weather: 'rain' })
    const seoul = buildSceneKey({ location: 'Seoul Office', time: 'night', mood: 'tense', weather: 'rain' })
    expect(tokyo).not.toBe(seoul)
  })

  it('normalizes casing and spacing so cache hits are not missed', () => {
    expect(buildSceneKey({ location: 'Tokyo  Hotel', time: 'Night', mood: 'tense', weather: 'rain' }))
      .toBe(buildSceneKey({ location: 'tokyo hotel', time: 'night', mood: 'tense', weather: 'rain' }))
  })
})
