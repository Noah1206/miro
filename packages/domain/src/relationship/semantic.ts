/**
 * Semantic Event Layer — 사용자의 문장을 관계 엔진에 곧바로 넣지 않는다.
 * 먼저 '무슨 일이 있었는가' 로 바꾼다. 규칙 분류는 항상 돌고(0원), LLM 분류는 보조로 붙일 수 있다.
 * 이 층이 있어야 관계 규칙을 바꾸거나 분류기를 교체해도 나머지가 흔들리지 않는다.
 */
export const SEMANTIC_EVENT_TYPES = [
  'compliment', 'confession', 'expressed_longing', 'rejection', 'hostility',
  'ignored_character', 'mentioned_other_romantic_interest', 'drank_with_someone',
  'shared_secret', 'lied', 'apologized', 'made_promise', 'broke_promise',
  'asked_about_character', 'gave_excuse', 'deliberate_avoidance',
] as const
export type SemanticEventType = (typeof SEMANTIC_EVENT_TYPES)[number]

export type SemanticEvent = { type: SemanticEventType; confidence: number }

type Pattern = { type: SemanticEventType; test: RegExp; confidence: number }

/** 한국어 규칙. 확신이 높은 순서로 적었다. 같은 문장에서 여러 사건이 나올 수 있다. */
const PATTERNS: Pattern[] = [
  { type: 'mentioned_other_romantic_interest', confidence: 0.9,
    test: /(다른|딴)\s*(남자|여자|사람|애)|소개팅|썸\s?(타|중)|전\s?(남친|여친|남자친구|여자친구)|남사친|여사친|데이트\s?(했|하고|갔)/ },
  { type: 'drank_with_someone', confidence: 0.8,
    test: /(술|맥주|소주|한잔|와인).{0,12}(같이|랑|과|와|하고)|(같이|랑|과|와|하고).{0,12}(술|맥주|소주|한잔|와인)/ },
  { type: 'confession', confidence: 0.85, test: /좋아해|좋아한다고|사랑해|사귀자|내\s?거\s?해|너\s?밖에/ },
  { type: 'expressed_longing', confidence: 0.8, test: /보고\s?싶|보고싶|(네|니|너)\s?생각(이\s?나|났)|그리워/ },
  { type: 'compliment', confidence: 0.75, test: /예쁘|귀여|잘생|멋있|멋지|최고야|대단해|잘했어|고마워/ },
  { type: 'apologized', confidence: 0.85, test: /미안|잘못했|사과할|용서/ },
  { type: 'hostility', confidence: 0.85, test: /꺼져|닥쳐|시끄러|짜증\s?나|뭐래|귀찮|신경\s?꺼|상관\s?없|알아서\s?해|됐어\s?그만|재수/ },
  { type: 'rejection', confidence: 0.8, test: /헤어지|그만\s?만나|관심\s?없|싫어졌|끝내자|우리\s?그만/ },
  { type: 'deliberate_avoidance', confidence: 0.8, test: /일부러|모른\s?척|안\s?받았어|무시했/ },
  { type: 'broke_promise', confidence: 0.7, test: /약속.{0,6}(못\s?지|어겼|깼|취소)/ },
  { type: 'made_promise', confidence: 0.7, test: /약속(할게|해|하자)|꼭\s?(갈게|할게|올게)|다음에\s?(꼭|같이)/ },
  { type: 'shared_secret', confidence: 0.7, test: /비밀인데|아무한테도|너한테만|사실은\s?나/ },
  { type: 'lied', confidence: 0.6, test: /거짓말(이었|했)|사실\s?아니|속였/ },
  { type: 'gave_excuse', confidence: 0.6, test: /야근|과제|시험|바빠|바빴|회의|출장|알바|폰이\s?(꺼|없|죽)/ },
  { type: 'asked_about_character', confidence: 0.5, test: /넌\s?뭐\s?해|너는\s?뭐|어땠어|괜찮아\?|밥\s?먹었|자니\?|뭐\s?하고\s?있/ },
]

/** 규칙 분류. 순수 함수 — 같은 문장이면 같은 사건. */
export function detectSemanticEvents(text: string): SemanticEvent[] {
  // Reported speech, quotations and negation are not actions toward this character.
  const clauses = text.replace(/```[\s\S]*?```|"[^"\n]*"|“[^”\n]*”|'[^'\n]*'|「[^」]*」/g, '')
    .split(/[.!?\n,]+/).filter(c => !/(라고|다고|라며|다며)\s*(말|했|하|들|적|쓰)|(라는|단)\s*(대사|말|문장)|예를\s*들|가정|만약/.test(c))
  const out: SemanticEvent[] = []
  for (const p of PATTERNS) {
    const matches = clauses.some(c => {
      if (!p.test.test(c)) return false
      if (/않|아니|안\s+(?:사랑|좋아|미안|약속)|못\s+(?:사랑|약속)/.test(c)) return false
      if (p.type === 'confession' && /(친구|그|그녀|걔|다른\s*사람|커피|음식|영화|음악|책|노래)(?:를|을|가|는|도|랑|에게)/.test(c)) return false
      return true
    })
    if (matches && !out.some(e => e.type === p.type)) out.push({ type: p.type, confidence: p.confidence })
  }
  // 사과가 있으면 같은 문장의 적대는 사과의 일부로 본다 ("짜증 나서 그랬어, 미안").
  if (out.some((e) => e.type === 'apologized')) return out.filter((e) => e.type !== 'hostility')
  return out
}

/** 두 분류기(규칙 + LLM)의 결과를 합친다. 같은 사건은 더 높은 확신을 남긴다. */
export function mergeSemanticEvents(a: SemanticEvent[], b: SemanticEvent[]): SemanticEvent[] {
  const map = new Map<SemanticEventType, number>()
  for (const e of [...a, ...b]) map.set(e.type, Math.max(map.get(e.type) ?? 0, e.confidence))
  return [...map].map(([type, confidence]) => ({ type, confidence }))
}
