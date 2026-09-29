export type CreateCharacterType = 'chat' | 'reality'

/** 만드는 동안의 초안 id(브라우저). 만들기는 미로 캐릭터만이지만 옛 일반 초안 키와 섞이지 않게 유형을 키에 둔다. */
export const activeDraftKey = (userId: string, type: CreateCharacterType) => `miro:create:active:${userId}:${type}`
