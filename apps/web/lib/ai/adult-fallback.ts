import { AIContentBlockedError, adultModelReady, adultRegistry, createAI } from '@miro/providers'

type AI = ReturnType<typeof createAI>
type Opts = Parameters<typeof createAI>[0]

/**
 * 11/18 뒤에서 도는 캐릭터 작업(하루 생활·먼저 연락 판단)은 언베일이 꺼진 방도 설정·대화가 수위 높으면 Gemini 안전 필터에 막혔다(content_blocked).
 * 막히면 그 호출만 성인 허용 모델(OpenRouter, createAI adult)로 한 번 다시 보낸다. 성인 모델이 없거나 이미 성인 방이면 그대로.
 */
export function createAIWithAdultFallback(opts: Opts): AI {
  const main = createAI(opts)
  if (opts.context?.adult === true || !adultModelReady()) return main
  let adult: AI | null = null
  const structured: AI['generateStructured'] = async (req) => {
    try { return await main.generateStructured(req) } catch (e) {
      if (!(e instanceof AIContentBlockedError)) throw e
      adult ??= createAI({ ...opts, context: { ...opts.context!, adult: true } })
      return adult.generateStructured(req)
    }
  }
  return new Proxy(main, { get: (target, prop, recv) => {
    if (prop === 'generateStructured') return structured
    const v = Reflect.get(target, prop, recv)
    return typeof v === 'function' ? v.bind(target) : v
  } })
}

/**
 * 11/22 언베일 방 안에서 고른 모델이 장면을 거절(content_blocked)하면 — 공급자 정책이라 그 모델로는 다시 될 리 없다 —
 * 같은 언베일 레지스트리에서 '거절한 모델을 뺀' 다른 대화 모델로 그 턴만 조용히 다시 받는다. 거절문을 사용자에게 보이지 않는다.
 * 공급자의 하드 정책을 무력화하는 게 아니라, 거절을 정상 실패로 보고 허용 모델(DeepSeek 등)로 넘기는 구조적 폴백이다.
 * 후보가 없으면(언베일 모델이 그 하나뿐) 원래 거절을 그대로 던진다 — 우회 지시나 무한 재시도는 없다.
 *
 * 폴백 순서는 env(MIRO_ADULT_MODEL_REGISTRY)가 정한다 — fallback:true 모델을 먼저, 그다음 선택 가능한 나머지. 코드에 모델을 박지 않는다.
 */
export function adultDialogueFallbacks(blockedModelId: string | undefined): string[] {
  const reg = (() => { try { return adultRegistry() } catch { return null } })()
  if (!reg) return []
  const usable = reg.models.filter(m => m.enabled && m.capabilities.includes('dialogue') && m.id !== blockedModelId)
  // 예비(fallback) 모델을 먼저 — 공급자 장애용 예비가 보통 거절 없는 모델(DeepSeek·Grok)이다. 그다음 직접 선택 가능한 것.
  const rank = (m: typeof usable[number]) => (m.fallback ? 0 : m.chatSelectable ? 1 : 2)
  return [...usable].sort((a, b) => rank(a) - rank(b)).map(m => m.id)
}

/**
 * 언베일 방 대화 LLM 을 감싼다. 고른 모델이 거절하면 다음 언베일 모델로 그 턴을 다시 받는다(스트리밍이면 재시도 때
 * onAttempt→onReset 으로 화면이 비워져 사용자는 거절도 교체도 못 느낀다). 언베일 방이 아니거나 전용 모델이 없으면 그대로.
 */
export function withAdultDialogueFallback(main: AI, opts: Opts): AI {
  if (opts.context?.adult !== true) return main
  const structured: AI['generateStructured'] = async (req) => {
    try { return await main.generateStructured(req) } catch (e) {
      // 대화만 넘긴다 — 의미 분석·기억은 거절이 드물고, 넘겨도 사용자가 보는 장면이 아니다.
      if (!(e instanceof AIContentBlockedError) || (req.task ?? 'dialogue') !== 'dialogue') throw e
      for (const modelId of adultDialogueFallbacks(opts.context?.dialogueModelId)) {
        const alt = createAI({ ...opts, context: { ...opts.context!, dialogueModelId: modelId } })
        // 11/24 속도: 다른 모델로 다시 받는 턴은 생각을 끈다 — 이미 한 번 기다린 뒤다(orchestrator 의 예비 시도와 같은 규칙).
        try { return await alt.generateStructured({ ...req, thinking: undefined }) } catch (e2) {
          if (e2 instanceof AIContentBlockedError) continue   // 이 모델도 거절 — 다음 후보.
          throw e2   // 공급자 장애 등은 그대로 올려 평소 경로가 처리한다.
        }
      }
      throw e   // 쓸 후보가 없다 — 원래 거절 그대로(우회하지 않는다).
    }
  }
  return new Proxy(main, { get: (target, prop, recv) => {
    if (prop === 'generateStructured') return structured
    const v = Reflect.get(target, prop, recv)
    return typeof v === 'function' ? v.bind(target) : v
  } })
}
