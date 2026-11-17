import { AIContentBlockedError, adultModelReady, createAI } from '@miro/providers'

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
