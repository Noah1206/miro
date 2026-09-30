import { msg } from '@/lib/i18n'

export type CreateCharacterType = 'chat' | 'reality'

/** 만들기에서 고르는 두 가지(2026-09-30 되살림). 화면에서 t() 로 옮긴다. */
export const CREATE_CHARACTER_OPTIONS: Array<{ type: CreateCharacterType; title: string; description: string }> = [
  { type: 'chat', title: msg('일반 캐릭터'), description: msg('설정한 성격과 이야기로 대화하는 캐릭터') },
  { type: 'reality', title: msg('미로 캐릭터'), description: msg('고유한 성격에 따라 행동하고, 관계와 상황이 이어지는 캐릭터') },
]

export const activeDraftKey = (userId: string, type: CreateCharacterType) => `miro:create:active:${userId}:${type}`
