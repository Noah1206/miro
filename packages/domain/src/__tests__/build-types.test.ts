import { describe, expect, it } from 'vitest'
import { BUILD_PRESETS, BUILD_TYPES } from '../character/types'

describe('build types', () => {
  it('every build has a label and a prompt', () => {
    for (const b of BUILD_TYPES) {
      expect(BUILD_PRESETS[b].label, b).toBeTruthy()
      expect(BUILD_PRESETS[b].prompt, b).toBeTruthy()
    }
  })

  /** providers/character/draft.schema.ts 가 같은 값을 따로 적고 있다 — 어긋나면 생성이 깨진다. */
  it('matches the list the character draft schema accepts', () => {
    expect([...BUILD_TYPES]).toEqual(['slim', 'average', 'muscular', 'heavy'])
  })
})
