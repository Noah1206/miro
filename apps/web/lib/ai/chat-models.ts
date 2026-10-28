import { adultRegistry, registryFromEnv, providerFromEnv, type ModelDefinition } from '@miro/providers'
import { POLICY, tokenPricing, tokenQuote, tokensForCost, productionRuntime } from '@miro/config'

export type ChatModel = string
export type ChatTier = typeof POLICY.chatTier.miro | typeof POLICY.chatTier.echo
export type ChatModelChoice = { id: string; name: string; provider?: string; providerLabel?: string; length: 'scene' | 'long'; maximumTokens: number; maxOutputTokens: number }
function availableModels(adult: boolean) {
  const registry = adult ? adultRegistry() : registryFromEnv(() => '').registry
  const candidates = registry?.models.filter(m => m.enabled && m.chatSelectable !== false && m.capabilities.includes('dialogue')
    && m.inputCost !== undefined && m.outputCost !== undefined
    && (!productionRuntime() || !!providerFromEnv(m.provider, m.providerModelId))) ?? []
  // A ready backup remains selectable when no primary is available.
  // Otherwise backups keep their existing role and never displace a primary model.
  const regular = candidates.filter(model => !model.fallback || model.chatSelectable === true)
  const models = regular.length ? regular : candidates
  const pinned = adult ? undefined : process.env.MIRO_CHAT_MODEL_ID
  return pinned ? models.sort((a, b) => Number(b.id === pinned) - Number(a.id === pinned)) : models
}
function choiceId(id: string, long: boolean) { return `model:${encodeURIComponent(id)}:${long ? 'long' : 'scene'}` }
function displayName(id: string) {
  const claude = /^claude-(haiku|sonnet|opus)-5-5$/.exec(id)
  if (claude) return `Claude ${claude[1]![0]!.toUpperCase()}${claude[1]!.slice(1)} 5.5`
  if (id === 'claude-fable-5') return 'Claude Fable 5'
  if (id === 'claude-fable-5-1') return 'Claude Fable 5.1'
  if (id === 'gemini-4-argon') return 'Gemini 4 Argon'
  const gpt = /^gpt-(6(?:\.1)?)-(luna|terra|sol|astra)$/.exec(id)
  if (gpt) return `GPT ${gpt[1]} ${gpt[2]![0]!.toUpperCase()}${gpt[2]!.slice(1)}`
  if (id === 'gpt-5.4-mini') return 'GPT-5.4 mini'
  if (id === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash-Lite'
  if (id === 'gemini-3.6-flash') return 'Gemini 3.6 Flash'
  if (id === 'gemini-3.8-flash') return 'Gemini 3.8 Flash'
  return id
}
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
    const pricing = tokenPricing()
    const choices: ChatModelChoice[] = availableModels(adult).flatMap(model => [false, true].map(long => {
      const tier = long ? POLICY.chatTier.echo : POLICY.chatTier.miro
      const quote = chatQuote(model, tier.maxOutputTokens, pricing, adult)
      return { id: choiceId(model.id, long), name: displayName(model.providerModelId), provider: model.provider, length: tier.replyLength,
        maximumTokens: quote.maximumTokens, maxOutputTokens: quote.maxOutputTokens }
    }))
    return { freeReady: choices.length > 0, proReady: choices.length > 0, choices }
  } catch { return { freeReady: false, proReady: false, choices: [] as ChatModelChoice[] } }
}
/** Legacy product ids still resolve, but all dialogue now draws from the token wallet. */
export async function resolveChatModel(_userId: string, choice: string, adult = false) {
  const models = availableModels(adult)
  const pinned = adult ? undefined : process.env.MIRO_CHAT_MODEL_ID
  const first = (pinned ? models.find(m => m.id === pinned) : undefined) ?? models[0]
  let model = first, long = choice === 'pro'
  if (choice !== 'miro' && choice !== 'pro') {
    const match = models.flatMap(m => [false, true].map(l => ({ m, l, id: choiceId(m.id, l) }))).find(c => c.id === choice)
    if (!match) throw new Error('invalid chat model')
    model = match.m; long = match.l
  }
  if (!model) throw new Error('chat model unavailable')
  const tierName = long ? 'echo' as const : 'miro' as const
  const tier = POLICY.chatTier[tierName]
  const pricing = tokenPricing()
  const quote = chatQuote(model, tier.maxOutputTokens, pricing, adult)
  return { modelId: model.id, metered: true, tier, tierName, pricing, quote }
}

/** 만들기의 권장 모델 후보(10/28) — 채팅에서 고를 수 있는 모델 하나씩. */
export async function recommendableModels(userId: string): Promise<Array<{ id: string; name: string }>> {
  const { choices } = await chatModelOptions(userId)
  return choices.filter(c => c.id.endsWith(':scene')).map(c => ({ id: decodeURIComponent(c.id.split(':')[1] ?? ''), name: c.name }))
}

/** 캐릭터의 권장 설정을 채팅 첫 선택값으로(10/28). 후보에 없으면 null — 서버 기본(첫 모델)을 쓴다. */
export function recommendedChoice(choices: ChatModelChoice[], rec: { model: string; length: 'scene' | 'long' } | null | undefined): string | null {
  if (!rec) return null
  const id = choiceId(rec.model, rec.length === 'long')
  return choices.some(c => c.id === id) ? id : null
}
