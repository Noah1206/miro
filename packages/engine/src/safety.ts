/**
 * 공급자 안전 필터가 막은 생성(AIContentBlockedError)을 사용자에게 '안전 거부'로 돌려주는 표식.
 * 입력·출력을 따로 판정하던 검열 분류기(flash-lite)는 10/2 에 뺐다 — 이제 거름망은 공급자 필터 하나다.
 */
export class UnsafeContentError extends Error {
  constructor() { super('CONTENT_NOT_ALLOWED') }
}

/**
 * 공급자 필터는 통과했지만 모델이 캐릭터를 벗어나 거절문을 대사로 쓴 경우(10/27). 캐릭터의 "미안" 같은 말과 헷갈리지 않게
 * AI·정책을 스스로 언급하는 어시스턴트식 문장만 본다. ponytail: 정규식 휴리스틱 — 오탐·미탐이 보이면 문장을 늘리거나 분류 작업으로.
 */
const REFUSAL = /(?:AI|인공지능|언어\s*모델|어시스턴트)(?:로서|으로서|이기\s*때문에|라서)|(?:콘텐츠\s*)?(?:정책|가이드라인|이용\s*약관)(?:상|에\s*따라|을\s*위반|에\s*어긋)|(?:그런|해당|이|그)\s*(?:요청|내용|장면)(?:은|에는|에)\s*(?:도와|응해|응할|응답할|제공할|작성할)\s*(?:드릴\s*)?수\s*없|\bI\s+(?:can(?:'|’)?t|cannot|won(?:'|’)t)\s+(?:help|assist|continue|provide|create|write|engage)|\bI(?:'|’)m\s+(?:not\s+able|unable)\s+to\b|\bas\s+an\s+AI\b/i
export function looksLikeRefusal(text: string): boolean { return REFUSAL.test(text) }
