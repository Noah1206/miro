import { adultRegistry, registryFromEnv, providerFromEnv, type ModelDefinition } from '@miro/providers'
import { POLICY, tokenPricing, tokenQuote, tokensForCost, productionRuntime } from '@miro/config'

export type ChatModel = string
/**
 * 한 턴 최소 차감 = 그 모델·길이의 자기 견적(검증 모델 몫을 뺀 것) × 이 비율.
 * 11/16: 예전엔 검증 모델(Sonnet 급)이 낀 견적의 0.125 였다 — 싼 모델도 최소 11토큰이라 원가의 5~10배가 빠졌다(운영 10일: Luna 원가 8원에 73원, Haiku 9.2배, DeepSeek 4.9배).
 * 자기 견적 기준으로 바꿔 싼 모델은 실제 원가를 따르게 하고(커뮤니티 조사: '내 캐릭터를 싸게'), Sonnet 은 142 × 0.16 = 23 그대로.
 */
export const MIN_TURN_SHARE = 0.16
/** 보통 한 턴에 빠지는 양(안내용) = 자기 견적 × 이 비율 — 운영 10일 Sonnet 평균 27/142. */
const TYPICAL_TURN_SHARE = 0.19
export type ChatTier = (typeof POLICY.chatTier)[keyof typeof POLICY.chatTier]
export type ChatLength = 'short' | 'scene' | 'plus' | 'long' | 'saga'
/** 답 길이 → 등급(10/28 saga: 아주 긴 대화). */
const TIER_OF = { short: 'short', scene: 'miro', plus: 'plus', long: 'echo', saga: 'saga' } as const
const LENGTHS = ['short', 'scene', 'plus', 'long', 'saga'] as const
export type ChatModelChoice = { id: string; name: string; provider?: string; providerLabel?: string; length: ChatLength; maximumTokens: number; typicalTokens: number; maxOutputTokens: number }
function availableModels(adult: boolean) {
  const registry = adult ? adultRegistry() : registryFromEnv(() => '').registry
  // 11/7 사용자: GPT 도 고르는 목록에 다시 연다(11/3 '목록에서 뺀다'를 뒤집음 — 예비 역할은 그대로).
  const candidates = registry?.models.filter(m => m.enabled && m.chatSelectable !== false && m.capabilities.includes('dialogue')
    && m.inputCost !== undefined && m.outputCost !== undefined
    && (!productionRuntime() || !!providerFromEnv(m.provider, m.providerModelId))) ?? []
  // A ready backup remains selectable when no primary is available.
  // Otherwise backups keep their existing role and never displace a primary model.
  const regular = candidates.filter(model => !model.fallback || model.chatSelectable === true)
  // 같은 모델이 두 항목(직결·OpenRouter 공유 등)으로 있으면 앞의 것만 목록에 — 11/3 모델 목록 확장.
  const models = (regular.length ? regular : candidates).filter((m, i, all) => all.findIndex(o => displayName(o.providerModelId) === displayName(m.providerModelId)) === i)
  const pinned = adult ? undefined : process.env.MIRO_CHAT_MODEL_ID
  return pinned ? models.sort((a, b) => Number(b.id === pinned) - Number(a.id === pinned)) : models
}
/**
 * 11/3: 일반·언베일 방의 고르는 목록을 같게 — 목록과 고른 값(choice id)은 일반 레지스트리 기준이고,
 * 언베일 방에서는 같은 모델의 언베일 쪽 짝(OpenRouter 경유 shared-*, 또는 언베일 자체 모델)으로 보낸다.
 * key = 화면·저장에 쓰는 id(두 방이 같다), model = 실제로 부를 모델.
 */
function choiceModels(adult: boolean): Array<{ key: string; model: ModelDefinition }> {
  const main = availableModels(false)
  if (!adult) return main.map(model => ({ key: model.id, model }))
  const own = availableModels(true)
  const byId = new Map(own.map(m => [m.id, m]))
  const paired = main.flatMap(m => {
    const twin = m.id.startsWith('shared-') ? byId.get(m.id.slice('shared-'.length)) : byId.get(`shared-${m.id}`)
    return twin ? [{ key: m.id, model: twin }] : []
  })
  // 일반 목록에 짝이 없는 언베일 모델(예비 제외)은 뒤에 — 일반 키가 없으면 그 모델 id 그대로.
  const covered = new Set(paired.map(p => p.model.id))
  const rest = own.filter(m => !covered.has(m.id) && !paired.some(p => displayName(p.model.providerModelId) === displayName(m.providerModelId))).map(model => ({ key: model.id, model }))
  return paired.length ? [...paired, ...rest] : rest
}
function choiceId(id: string, length: ChatLength) { return `model:${encodeURIComponent(id)}:${length}` }
function displayName(id: string) {
  // OpenRouter 이름(언베일 방, 11/3): anthropic/claude-sonnet-5.5 · google/gemini-3.8-flash → 직결 이름과 같게.
  id = id.replace(/^(anthropic|google|openai)\//, '')
  // claude-opus-4-6 · claude-opus-4.6 · claude-opus-5 · claude-sonnet-5-5 → Claude Opus 4.6 / Opus 5 / Sonnet 5.5
  const claude = /^claude-(haiku|sonnet|opus)-(\d+)(?:[.-](\d+))?$/.exec(id)
  if (claude) return `Claude ${claude[1]![0]!.toUpperCase()}${claude[1]!.slice(1)} ${claude[2]}${claude[3] ? `.${claude[3]}` : ''}`
  if (id === 'gemini-3-flash-preview') return 'Gemini 3 Flash'
  if (id === 'gemini-3.1-pro-preview') return 'Gemini 3.1 Pro'
  if (id === 'claude-fable-5') return 'Claude Fable 5'
  if (id === 'claude-fable-5-1') return 'Claude Fable 5.1'
  if (/^claude-fable-5[.-]2$/.test(id)) return 'Claude Fable 5.2'
  // google/gemma-4-31b-it → Gemma 4 31B
  const gemma = /^gemma-(\d+)-(\d+)b(?:-.*)?$/.exec(id)
  if (gemma) return `Gemma ${gemma[1]} ${gemma[2]}B`
  const gemini4 = /^gemini-4-(argon|carbon|hydrogen)$/.exec(id)
  if (gemini4) return `Gemini 4 ${gemini4[1]![0]!.toUpperCase()}${gemini4[1]!.slice(1)}`
  // 11/10 GPT 추가: 5.6 시리즈(Luna/Terra/Sol)·5.5·5.4(mini/nano)도 같은 이름 규칙으로.
  const gpt = /^gpt-(\d+(?:\.\d+)?)-(luna|terra|sol|astra)$/.exec(id)
  if (gpt) return `GPT ${gpt[1]} ${gpt[2]![0]!.toUpperCase()}${gpt[2]!.slice(1)}`
  const plain = /^gpt-(\d+(?:\.\d+)?)(?:-(mini|nano))?$/.exec(id)
  if (plain) return `GPT-${plain[1]}${plain[2] ? ` ${plain[2]}` : ''}`
  if (id === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash-Lite'
  if (id === 'gemini-3.6-flash') return 'Gemini 3.6 Flash'
  const deepseek = /^deepseek\/deepseek-(.+)$/.exec(id)
  if (deepseek) return `DeepSeek ${deepseek[1]!.replace(/-/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase())}`
  if (id === 'gemini-3.7-flash') return 'Gemini 3.7 Flash'
  if (id === 'gemini-3.8-flash') return 'Gemini 3.8 Flash'
  return id
}
/**
 * 11/16 사용자: Fable·Opus 는 한 턴에 토큰을 1.5배 더 받는다(Fable 5.1 약 190 → 290, Opus 5.5 약 56 → 84) — 출석 500토큰으로 Fable 을 2.6턴 쓸 수 있었다.
 * 원가 비중을 그만큼 낮춰 견적·예약·차감·최소 차감이 한 값으로 같이 움직인다. 직결(claude-opus-5-5)과 OpenRouter(anthropic/claude-opus-5.5) 이름 모두.
 */
export const PREMIUM_CHARGE = 1.5
const pricingFor = (model: ModelDefinition, base = tokenPricing()) =>
  /claude-(fable|opus)-/.test(model.providerModelId) ? { ...base, costShare: base.costShare / PREMIUM_CHARGE } : base
/** A cheap renderer still shares its envelope with the server-pinned verifier. */
function chatQuote(model: ModelDefinition, output: number, pricing: ReturnType<typeof tokenPricing>, adult: boolean) {
  const quote = tokenQuote(model, output, pricing)
  const verifierId = !adult && process.env.MIRO_AGENCY_VERIFY_MODEL_ID?.trim()
  if (!verifierId) return quote
  const verifier = registryFromEnv(() => '').registry.get(verifierId)
  const verification = tokenQuote(verifier, output, { ...pricing, turnAllowance: 1 })
  const maximumUSD = quote.maximumUSD + Math.max(0, verification.maximumUSD - quote.maximumUSD / pricing.turnAllowance)
  return { ...quote, maximumUSD, maximumTokens: tokensForCost(maximumUSD, pricing) }
}
export async function chatModelOptions(_userId: string, adult = false) {
  try {
    const base = tokenPricing()
    const choices: ChatModelChoice[] = choiceModels(adult).flatMap(({ key, model }) => LENGTHS.map(length => {
      const pricing = pricingFor(model, base)
      const tier = POLICY.chatTier[TIER_OF[length]]
      const quote = chatQuote(model, tier.maxOutputTokens, pricing, adult)
      return { id: choiceId(key, length), name: displayName(model.providerModelId), provider: model.provider, length: tier.replyLength,
        maximumTokens: quote.maximumTokens, typicalTokens: Math.max(1, Math.ceil(tokenQuote(model, tier.maxOutputTokens, pricing).maximumTokens * TYPICAL_TURN_SHARE)), maxOutputTokens: quote.maxOutputTokens }
    }))
    return { freeReady: choices.length > 0, proReady: choices.length > 0, choices }
  } catch { return { freeReady: false, proReady: false, choices: [] as ChatModelChoice[] } }
}
/** Legacy product ids still resolve, but all dialogue now draws from the token wallet. */
export async function resolveChatModel(_userId: string, choice: string, adult = false) {
  const models = choiceModels(adult)
  // 기본 모델은 두 방이 같다(11/3) — 일반 방의 지정 모델(MIRO_CHAT_MODEL_ID)이 언베일 방에서도 첫 값.
  const pinned = process.env.MIRO_CHAT_MODEL_ID
  const firstEntry = (pinned ? models.find(m => m.key === pinned) : undefined) ?? models[0]
  let model = firstEntry?.model, key = firstEntry?.key, length: ChatLength = choice === 'pro' ? 'long' : 'scene'
  if (choice !== 'miro' && choice !== 'pro') {
    const match = models.flatMap(m => LENGTHS.map(l => ({ m: m.model, k: m.key, l, id: choiceId(m.key, l) }))).find(c => c.id === choice)
    if (!match) throw new Error('invalid chat model')
    model = match.m; key = match.k; length = match.l
  }
  if (!model) throw new Error('chat model unavailable')
  const tierName = TIER_OF[length]
  const tier = POLICY.chatTier[tierName]
  const pricing = pricingFor(model)
  const quote = chatQuote(model, tier.maxOutputTokens, pricing, adult)
  // 11/14 사용자: 한 턴 최소 차감은 모델별로 — 일반 방 견적(검증 포함)의 MIN_TURN_SHARE. 언베일 방도 같은 모델이면 같은 최소를 받는다.
  const main = adult ? availableModels(false).find(m => m.id === key) : model
  const floorTokens = Math.ceil(tokenQuote(main ?? model, tier.maxOutputTokens, pricing).maximumTokens * MIN_TURN_SHARE)
  return { modelId: model.id, metered: true, tier, tierName, pricing, quote, floorTokens }
}

/** 만들기의 권장 모델 후보(10/28) — 채팅에서 고를 수 있는 모델 하나씩. */
export async function recommendableModels(userId: string): Promise<Array<{ id: string; name: string }>> {
  const { choices } = await chatModelOptions(userId)
  return choices.filter(c => c.id.endsWith(':scene')).map(c => ({ id: decodeURIComponent(c.id.split(':')[1] ?? ''), name: c.name }))
}

/** 캐릭터의 권장 설정을 채팅 첫 선택값으로(10/28). 후보에 없으면 null — 서버 기본(첫 모델)을 쓴다. */
export function recommendedChoice(choices: ChatModelChoice[], rec: { model: string; length: ChatLength } | null | undefined): string | null {
  if (!rec) return null
  const id = choiceId(rec.model, rec.length)
  return choices.some(c => c.id === id) ? id : null
}
