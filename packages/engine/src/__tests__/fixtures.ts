import type { SimulationSnapshot } from '../context'
import type { CharacterCore, Npc, RelationshipState, SimulationEvent, WorldState } from '@miro/domain'

export function character(over: Partial<CharacterCore['personality']> = {}): CharacterCore {
  return {
    id: 'c1', ownerId: null, isOfficial: true,
    identity: { name: '토마스', age: '32', nationality: '영국', occupation: '복원가', mbti: 'INTJ' },
    personality: {
      personality: '거리를 둔다', values: '약속', speechStyle: '짧은 존대',
      userNickname: null, hobbies: ['고서'], dislikes: ['무례함'],
      jealousy: 35, initiative: 25, emotionalExpression: 20, ...over,
    },
    worldRole: { socialPosition: null, startingContext: null },
    visualIdentityId: null, contactProfileId: null,
  }
}

export function relationship(over: Partial<RelationshipState> = {}): RelationshipState {
  return {
    id: 'r1', sessionId: 's1', version: 1,
    trust: 30, attraction: 10, jealousy: 0,
    protectiveness: 20, emotionalDistance: 60, attachment: 10,
    stage: 'stranger', unresolvedEventIds: [], updatedAt: new Date(), ...over,
  }
}

export function world(over: Partial<WorldState> = {}): WorldState {
  return {
    id: 'w1', sessionId: 's1', version: 1,
    currentLocation: '런던 구시가지', currentTime: '저녁',
    currentSceneId: null, worldStatus: null,
    activeEventIds: [], activeNpcIds: [], unresolvedWorldEvents: [],
    updatedAt: new Date(), ...over,
  }
}

export function event(over: Partial<SimulationEvent> = {}): SimulationEvent {
  return {
    id: 'e1', sessionId: 's1', type: 'injury', status: 'active',
    context: {}, participantNpcIds: [], continuationState: { detail: '왼팔 부상' },
    consequences: [], cooldownUntilTurn: 0, createdAtTurn: 1, resolvedAtTurn: null, ...over,
  }
}

export function npc(over: Partial<Npc> = {}): Npc {
  return {
    id: 'n1', sessionId: 's1', name: '이수현', role: '동료',
    knows: ['user_works_here'], relationshipToCharacter: 'colleague',
    relationshipToUser: 'stranger', isActive: true, ...over,
  }
}

export function snapshot(over: Partial<SimulationSnapshot> = {}): SimulationSnapshot {
  return {
    character: character(),
    world: world(),
    worldSetting: '오래된 책이 거래되는 골목',
    relationship: relationship(),
    scene: null,
    memories: [],
    recentMessages: [],
    activeEvents: [],
    recentlyResolvedEvents: [],
    activeNpcs: [],
    recentRealityContacts: [],
    outputStyle: 'balanced',
    turnCount: 5,
    ...over,
  }
}
