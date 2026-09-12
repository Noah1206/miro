import { describe, expect, it } from 'vitest'
import { validateNpcKnowledge, type Npc } from '../npc/types.js'

const npc: Npc = {
  id: 'n1', sessionId: 's1', name: '이수현', role: 'coworker',
  knows: ['user_works_at_company'],
  relationshipToCharacter: 'colleague', relationshipToUser: 'stranger', isActive: true,
}

describe('npc knowledge boundary', () => {
  it('allows action grounded in what the NPC actually knows', () => {
    expect(validateNpcKnowledge({ npcId: 'n1', action: 'greets', basedOn: ['user_works_at_company'] }, npc)).toBe(true)
  })

  it('blocks action based on facts the NPC could not know', () => {
    expect(validateNpcKnowledge({ npcId: 'n1', action: 'mentions secret', basedOn: ['user_secret_confession'] }, npc)).toBe(false)
  })
})
