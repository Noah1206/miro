import { msg } from '@/lib/i18n'

export type CreateCharacterType = 'chat' | 'reality'

/**
 * 만들기에서 고르는 유형. 첫 베타는 미로 캐릭터만 연다 — 캐릭터챗은 숨긴다(2026-09-30 결정, 코드는 둔다).
 * 다시 열 때는 chat 줄의 hidden 만 지운다. 하나만 남으면 만들기는 고르는 시트 없이 바로 편집기로 간다.
 */
const OPTIONS: Array<{ type: CreateCharacterType; title: string; description: string; hidden?: boolean }> = [
  { type: 'chat', title: msg('캐릭터챗'), description: msg('설정한 성격과 이야기로 대화하는 캐릭터'), hidden: true },
  { type: 'reality', title: msg('미로 캐릭터'), description: msg('고유한 성격에 따라 행동하고, 관계와 상황이 이어지는 캐릭터') },
]
export const CREATE_CHARACTER_OPTIONS = OPTIONS.filter(option => !option.hidden)

export const activeDraftKey = (userId: string, type: CreateCharacterType) => `miro:create:active:${userId}:${type}`

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** 편집기 주소 — 쓰다 만 초안이 있으면 이어 연다. 브라우저 저장소가 막혀 있으면 만들기 화면이 새 초안을 준다. */
export function createHref(userId: string, type: CreateCharacterType) {
  let href = `/create?type=${type}`
  try {
    const active = localStorage.getItem(activeDraftKey(userId, type))
    if (active && UUID.test(active)) href += `&draft=${active}`
  } catch { /* storage blocked */ }
  return href
}
