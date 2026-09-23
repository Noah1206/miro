import { describe, expect, it } from 'vitest'
import { characterExperience } from './character-experience'

describe('creator contact opt-in', () => {
  it('starts a new character with the selected capability', () => {
    expect(characterExperience(true)).toBe('reality')
    expect(characterExperience(false)).toBe('chat')
  })
  it('preserves existing types unless chat explicitly opts in', () => {
    expect(characterExperience(true, 'chat')).toBe('chat')
    expect(characterExperience(true, 'chat', true)).toBe('reality')
    expect(characterExperience(false, 'reality', true)).toBe('reality')
    expect(characterExperience(false, 'chat', true)).toBe('chat')
  })
})
