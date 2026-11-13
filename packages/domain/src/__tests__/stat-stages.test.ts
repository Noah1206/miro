import { expect, test } from 'vitest'
import { currentStage, visibleStatValues, type CharacterStat } from '../character/types'

const awareness: CharacterStat = { name: '이성 자각', min: 0, max: 4, default: 0, description: '', hidden: true,
  stages: [{ from: 2, behavior: '얼굴을 돌린다' }, { from: 0, behavior: '평소대로' }, { from: 4, behavior: '진지해진다' }] }
const affection: CharacterStat = { name: '호감', min: 0, max: 100, default: 10, description: '' }

test('stage = highest from not above the value; hidden stats never reach the screen', () => {
  expect(currentStage(awareness, 0)?.behavior).toBe('평소대로')
  expect(currentStage(awareness, 3)?.behavior).toBe('얼굴을 돌린다')
  expect(currentStage(awareness, 4)?.behavior).toBe('진지해진다')
  expect(currentStage(affection, 50)).toBeNull()
  expect(visibleStatValues([awareness, affection], { '이성 자각': 3, 호감: 40 })).toEqual({ 호감: 40 })
})
