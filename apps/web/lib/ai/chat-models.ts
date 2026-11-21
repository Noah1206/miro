import { adultRegistry, registryFromEnv, providerFromEnv, type ModelDefinition } from '@miro/providers'
import { POLICY, tokenPricing, tokenQuote, tokensForCost, productionRuntime } from '@miro/config'

export type ChatModel = string
/** 11/19 사용자: 오픈 이벤트 — 11/20~11/26(KST) 채팅방 Haiku 대화는 토큰을 깎지 않는다(음성 턴은 평소대로). ponytail: 날짜 고정, 다음 이벤트 때 env 로. */
const FREE_CHAT = { modelId: 'claude-haiku', from: Date.parse('2026-11-20T00:00:00+09:00'), until: Date.parse('2026-11-27T00:00:00+09:00') }
export const freeChatTurn = (modelId: string, now = Date.now()) => modelId === FREE_CHAT.modelId && now >= FREE_CHAT.from && now < FREE_CHAT.until
/**
 * 한 턴 최소 차감 = 그 모델·길이의 자기 견적(검증 모델 몫을 뺀 것) × 이 비율.
 * 11/16: 예전엔 검증 모델(Sonnet 급)이 낀 견적의 0.125 였다 — 싼 모델도 최소 11토큰이라 원가의 5~10배가 빠졌다(운영 10일: Luna 원가 8원에 73원, Haiku 9.2배, DeepSeek 4.9배).
 * 자기 견적 기준으로 바꿔 싼 모델은 실제 원가를 따르게 하고(커뮤니티 조사: '내 캐릭터를 싸게'), Sonnet 은 142 × 0.16 = 23 그대로.
 */
export const MIN_TURN_SHARE = 0.16
/** 보통 한 턴에 빠지는 양(안내용) = 자기 견적 × 이 비율 — 운영 10일 Sonnet 평균 27/142. */
const TYPICAL_TURN_SHARE = 0.19
/**
 * 11/18 사용자: 한 자리 수로 보이던 싼 모델도 한 턴 20토큰보다 많게, 그러나 모두 같은 값이 아니라 모델마다 다르게.
 * 21 + 원래 값 × 0.35 로 아래쪽만 들어 올린다 — 원가 순서는 그대로(Haiku 22 · Gemma 23 · DeepSeek 24 · Gemini 3 Flash 26 · 3.8 Flash 27 · Terra 29),
 * 원래 값이 약 32 이상인 모델(Sonnet 등)은 그대로. 최소 차감과 '보통' 안내에 같이 쓴다.
 */
export const liftTurnTokens = (raw: number) => Math.ceil(Math.max(raw, 21 + raw * 0.35))
/** 11/18 사용자: 원가가 똑같은 쌍도 값이 달라야 한다 — 상위·최신 쪽을 1 높게(Luna 21 < Haiku 22, 3.7 Flash 27 < 3.8 Flash 28). */
const TURN_TOKEN_NUDGE: Array<[RegExp, number]> = [[/gpt-6-luna$/, -1], [/gemini-3\.8-flash$/, 1]]
const nudge = (providerModelId: string) => TURN_TOKEN_NUDGE.find(([re]) => re.test(providerModelId))?.[1] ?? 0
/**
 * 11/21 사용자: 한 턴 토큰을 다른 플랫폼의 모델별 최소값을 기준으로 올린다 — '보통 장면'의 최소 차감이 이 값이 되고,
 * 다른 길이·'보통' 안내는 같은 배수로 함께 오른다. 그 플랫폼 목록에 있는 모델은 그 값 그대로(3.8 Flash 는 3.7 보다 1 높게),
 * 없는 모델은 원가가 비슷한 모델 값에 맞췄다. 표에 없는 새 모델은 예전 계산 그대로.
 */
const SCENE_TURN_TOKENS: Record<string, number> = {
  'Gemini 4 Argon': 120, 'Gemini 4 Carbon': 120, 'Gemini 4 Hydrogen': 95,
  'Gemini 3.8 Flash': 68, 'Gemini 3.7 Flash': 67, 'Gemini 3 Flash': 31, 'Gemini 3.1 Pro': 111,
  'Claude Opus 5.5': 196, 'Claude Opus 5': 245, 'Claude Opus 4.6': 245, 'Claude Fable 5.2': 392,
  'GPT 6 Sol': 214, 'GPT 6.1 Sol': 214,
  'Claude Sonnet 5.5': 120, 'Claude Haiku 5.5': 29, 'GPT 6 Luna': 28, 'GPT 6.1 Terra': 70, 'GPT 6 Astra': 330,
  'GPT 5.6 Sol': 150, 'GPT 5.6 Terra': 111, 'GPT-5.5': 185, 'GPT-5.4': 125, 'Gemma 4 31B': 30, 'DeepSeek V4.1 Flash': 30,
}
/** 11/21 사용자: 그 플랫폼보다 낮게, 거부감 들지 않게 — 표 값의 70%. 예전 값보다 낮아지는 모델은 예전 값 그대로. */
const TURN_TOKEN_RATIO = 0.7
/** 예전 계산의 '보통 장면' 최소 차감 대비 표 값(× 비율)의 배수 — 표에 없으면 1. */
function turnScale(model: ModelDefinition, pricing: ReturnType<typeof tokenPricing>) {
  const name = displayName(model.providerModelId)
  const listed = SCENE_TURN_TOKENS[name]
  if (!listed) return 1
  // 3.8 Flash 는 3.7 Flash 보다 늘 1 높게(비율을 곱한 뒤에도).
  const target = name === 'Gemini 3.8 Flash' ? Math.round(SCENE_TURN_TOKENS['Gemini 3.7 Flash']! * TURN_TOKEN_RATIO) + 1 : Math.round(listed * TURN_TOKEN_RATIO)
  const scene = liftTurnTokens(tokenQuote(model, POLICY.chatTier.miro.maxOutputTokens, pricing).maximumTokens * MIN_TURN_SHARE) + nudge(model.providerModelId)
  return Math.max(1, target / scene)
}
/**
 * 11/21 사용자: 비싼 모델은 기간 한정 20% 할인 — 지금 값이 할인가, 정가 = 할인가 ÷ 0.8. 2026-12-31(KST)이 지나면 정가가 자동으로 적용된다.
 * 화면은 기간 안에만 정가(줄 그음)·할인가·'20% 할인'을 보여 준다(실제로 그 기간에만 깎아 주는 할인).
 */
export const TURN_PROMO = { rate: 0.2, until: Date.parse('2027-01-01T00:00:00+09:00'), models: ['Claude Fable 5.2', 'GPT 6 Astra', 'GPT 6.1 Sol', 'Claude Opus 5.5', 'GPT-5.5'] }
const promoModel = (model: ModelDefinition) => TURN_PROMO.models.includes(displayName(model.providerModelId))
/** 할인 중이면 1, 할인이 끝난 할인 대상 모델은 정가 배수(1/0.8), 나머지 1. */
const promoScale = (model: ModelDefinition, now = Date.now()) => promoModel(model) && now >= TURN_PROMO.until ? 1 / (1 - TURN_PROMO.rate) : 1
const promoActive = (model: ModelDefinition, now = Date.now()) => promoModel(model) && now < TURN_PROMO.until
/** 11/18 사용자: 고르는 목록에서 뺀 모델(예비 역할 gpt-5.4-mini 는 그대로 — 목록에만 안 뜬다). */
// 11/21 사용자: 겹쳐 보이는 모델은 같은 계열의 최신 하나만 — Opus 5.5(5·4.6 뺌), GPT 6.1 Sol·Terra(6 Sol·5.6 Sol·5.6 Terra 뺌), GPT-5.5(5.4 뺌).
// GPT 6 Luna·Gemma 4·DeepSeek 도 뺀다. 예전에 골라 둔 방은 기본 모델로 이어진다.
// 11/21 사용자: Haiku 도 사용자가 고르지 못하게 뺀다(일반·언베일 방 모두). 전에 Haiku 를 골라 둔 방은 기본 모델로 이어진다.
const HIDDEN_CHAT_MODELS = /(^|\/)(gpt-(5\.4(-(mini|nano))?|5\.6-(luna|sol|terra)|6-luna|6-sol)$|claude-opus-(4[.-]6|5)$|claude-haiku-|gemma-4-|deepseek-)/
export type ChatTier = (typeof POLICY.chatTier)[keyof typeof POLICY.chatTier]
export type ChatLength = 'short' | 'scene' | 'plus' | 'long' | 'saga'
/** 답 길이 → 등급(10/28 saga: 아주 긴 대화). */
const TIER_OF = { short: 'short', scene: 'miro', plus: 'plus', long: 'echo', saga: 'saga' } as const
const LENGTHS = ['short', 'scene', 'plus', 'long', 'saga'] as const
export type ChatModelChoice = { id: string; name: string; provider?: string; providerLabel?: string; length: ChatLength; maximumTokens: number; typicalTokens: number; maxOutputTokens: number; thinking?: boolean; free?: boolean
  /** 11/21 기간 한정 할인 중이면 정가(보통 한 턴)와 할인율. */
  listTokens?: number; discountRate?: number }
/** 11/16 생각 강도가 실제로 먹는 모델만 — Claude·GPT 5/6·Gemini 3/4(3.5 Flash 는 생각을 끈 모델). DeepSeek·Grok·Gemma 는 화면에서 막대를 숨기고 서버도 무시한다. */
export const modelThinks = (providerModelId: string) => /(^|\/)(claude-|gpt-[56]|gemini-(3-|3\.[1678]|4-))/.test(providerModelId)
function availableModels(adult: boolean) {
  const registry = adult ? adultRegistry() : registryFromEnv(() => '').registry
  // 11/7 사용자: GPT 도 고르는 목록에 다시 연다(11/3 '목록에서 뺀다'를 뒤집음 — 예비 역할은 그대로).
  const candidates = registry?.models.filter(m => m.enabled && m.chatSelectable !== false && m.capabilities.includes('dialogue')
    && m.inputCost !== undefined && m.outputCost !== undefined && !HIDDEN_CHAT_MODELS.test(m.providerModelId)
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
      const typical = Math.round(Math.min(quote.maximumTokens, Math.round((liftTurnTokens(tokenQuote(model, tier.maxOutputTokens, pricing).maximumTokens * TYPICAL_TURN_SHARE) + nudge(model.providerModelId)) * turnScale(model, pricing))) * promoScale(model))
      return { id: choiceId(key, length), name: displayName(model.providerModelId) + (freeChatTurn(model.id) ? ' · 무료' : ''), provider: model.provider, length: tier.replyLength,
        maximumTokens: quote.maximumTokens, typicalTokens: typical, maxOutputTokens: quote.maxOutputTokens, thinking: modelThinks(model.providerModelId), free: freeChatTurn(model.id),
        ...(promoActive(model) ? { listTokens: Math.round(typical / (1 - TURN_PROMO.rate)), discountRate: TURN_PROMO.rate } : {}) }
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
    // 11/18 목록에서 뺀 모델을 전에 골라 둔 방은 기본 모델로(같은 길이) — 실패시키지 않는다.
    const staleLength = LENGTHS.find(l => choice.endsWith(`:${l}`))
    if (!match && !(choice.startsWith('model:') && staleLength)) throw new Error('invalid chat model')
    if (match) { model = match.m; key = match.k; length = match.l } else length = staleLength!
  }
  if (!model) throw new Error('chat model unavailable')
  const tierName = TIER_OF[length]
  const tier = POLICY.chatTier[tierName]
  const pricing = pricingFor(model)
  const quote = chatQuote(model, tier.maxOutputTokens, pricing, adult)
  // 11/14 사용자: 한 턴 최소 차감은 모델별로 — 일반 방 견적(검증 포함)의 MIN_TURN_SHARE. 언베일 방도 같은 모델이면 같은 최소를 받는다.
  const main = adult ? availableModels(false).find(m => m.id === key) : model
  const floorTokens = Math.round((liftTurnTokens(tokenQuote(main ?? model, tier.maxOutputTokens, pricing).maximumTokens * MIN_TURN_SHARE) + nudge(model.providerModelId)) * turnScale(main ?? model, pricing) * promoScale(main ?? model))
  // thinking 은 선택 칸으로 — 이 반환형을 흉내 내는 시험 자료를 깨지 않는다.
  return Object.assign({ modelId: model.id, metered: true, tier, tierName, pricing, quote, floorTokens }, { thinking: modelThinks(model.providerModelId) } as { thinking?: boolean })
}

/** 만들기의 권장 모델 후보(10/28) — 채팅에서 고를 수 있는 모델 하나씩. */
export async function recommendableModels(userId: string): Promise<Array<{ id: string; name: string }>> {
  const { choices } = await chatModelOptions(userId)
  return choices.filter(c => c.id.endsWith(':scene')).map(c => ({ id: decodeURIComponent(c.id.split(':')[1] ?? ''), name: c.name }))
}

/** 캐릭터의 권장 설정을 채팅 첫 선택값으로(10/28). 후보에 없으면 null — 서버 기본(첫 모델)을 쓴다. */
/** 11/21 사용자: 채팅방에 들어왔을 때 기본 출력량은 다섯 단계의 가운데('조금 길게', plus) — 같은 모델의 plus 선택지로. 없으면 그대로. 사용자가 고른 값(저장소)이 있으면 그쪽이 이긴다. */
export function middleLength(choices: ChatModelChoice[], id: string | undefined): string | undefined {
  const mid = id?.replace(/:[a-z]+$/, ':plus')
  return mid && choices.some(c => c.id === mid) ? mid : id
}
export function recommendedChoice(choices: ChatModelChoice[], rec: { model: string; length: ChatLength } | null | undefined): string | null {
  if (!rec) return null
  const id = choiceId(rec.model, rec.length)
  return choices.some(c => c.id === id) ? id : null
}
