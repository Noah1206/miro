/**
 * 공급자 안전 필터가 막은 생성(AIContentBlockedError)을 사용자에게 '안전 거부'로 돌려주는 표식.
 * 입력·출력을 따로 판정하던 검열 분류기(flash-lite)는 10/2 에 뺐다 — 이제 거름망은 공급자 필터 하나다.
 */
export class UnsafeContentError extends Error {
  constructor() { super('CONTENT_NOT_ALLOWED') }
}
