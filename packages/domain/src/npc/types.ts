export type Npc = {
  id: string
  sessionId: string
  name: string
  role: string
  /** NPC Knowledge Boundary — 알 수 없는 정보로 행동하지 않게 한다. */
  knows: string[]
  relationshipToCharacter: string
  relationshipToUser: string
  isActive: boolean
}

export type NpcAction = {
  npcId: string
  action: string
  /** 이 행동의 근거가 되는, NPC 가 실제로 아는 정보. */
  basedOn: string[]
}

/** NPC 가 알 수 없는 정보를 근거로 행동하려 하면 차단한다. */
export function validateNpcKnowledge(action: NpcAction, npc: Npc): boolean {
  return action.basedOn.every((fact) => npc.knows.includes(fact))
}
