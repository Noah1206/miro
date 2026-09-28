export type CreateCharacterType = 'chat' | 'reality'

export const CREATE_CHARACTER_OPTIONS: Array<{ type: CreateCharacterType; title: string; description: string }> = [
  { type: 'chat', title: '일반 캐릭터', description: '설정한 성격과 이야기로 대화하는 캐릭터' },
  { type: 'reality', title: '미로 캐릭터', description: '고유한 성격에 따라 행동하고, 관계와 상황이 이어지는 캐릭터' },
]

export const activeDraftKey = (userId: string, type: CreateCharacterType) => `miro:create:active:${userId}:${type}`
