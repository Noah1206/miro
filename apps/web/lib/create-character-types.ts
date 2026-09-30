import { msg } from '@/lib/i18n'

export type CreateCharacterType = 'chat' | 'reality'

/**
 * 만들기에서 고르는 유형. 첫 베타는 미로 캐릭터만 연다 — 캐릭터챗은 숨긴다(2026-09-30 결정, 코드는 둔다).
 * 다시 열 때는 chat 줄의 hidden 만 지운다. 하나만 남으면 /create 는 고르는 화면 없이 바로 편집기로 간다(하단 만들기 탭은 없앴다, 2026-09-30).
 */
const OPTIONS: Array<{ type: CreateCharacterType; title: string; description: string; hidden?: boolean }> = [
  { type: 'chat', title: msg('캐릭터챗'), description: msg('설정한 성격과 이야기로 대화하는 캐릭터'), hidden: true },
  { type: 'reality', title: msg('미로 캐릭터'), description: msg('고유한 성격에 따라 행동하고, 관계와 상황이 이어지는 캐릭터') },
]
export const CREATE_CHARACTER_OPTIONS = OPTIONS.filter(option => !option.hidden)

export const activeDraftKey = (userId: string, type: CreateCharacterType) => `miro:create:active:${userId}:${type}`
