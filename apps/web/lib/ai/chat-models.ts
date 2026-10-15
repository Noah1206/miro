import { adultRegistry, registryFromEnv, providerFromEnv } from '@miro/providers'
import { POLICY, tokenPricing, tokenQuote, productionRuntime } from '@miro/config'

export type ChatModel = string
export type ChatTier = typeof POLICY.chatTier.miro | typeof POLICY.chatTier.echo
export type ChatModelChoice = { id: string; name: string; length: 'scene' | 'long'; maximumTokens: number; maxOutputTokens: number }
function availableModels(adult: boolean) {
  const registry = adult ? adultRegistry() : registryFromEnv(() => '').registry
  const models = registry?.models.filter(m => m.enabled && !m.fallback && m.capabilities.includes('dialogue')
    && m.inputCost !== undefined && m.outputCost !== undefined
    && (!productionRuntime() || !!providerFromEnv(m.provider, m.providerModelId))) ?? []
  const pinned = adult ? undefined : process.env.MIRO_CHAT_MODEL_ID
  return pinned ? models.sort((a, b) => Number(b.id === pinned) - Number(a.id === pinned)) : models
}
function choiceId(id: string, long: boolean) { return `model:${encodeURIComponent(id)}:${long ? 'long' : 'scene'}` }
function displayName(id: string) {
  if (id === 'claude-sonnet-5-5') return 'Claude Sonnet 5.5'
  if (id === 'gpt-5.4-mini') return 'GPT-5.4 mini'
  if (id === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash-Lite'
  if (id === 'gemini-3.6-flash') return 'Gemini 3.6 Flash'
  if (id === 'gemini-3.8-flash') return 'Gemini 3.8 Flash'
  return id
}
export async function chatModelOptions(_userId: string, adult = false) {
  try {
    const pricing = tokenPricing()
    const choices: ChatModelChoice[] = availableModels(adult).flatMap(model => [false, true].map(long => {
      const tier = long ? POLICY.chatTier.echo : POLICY.chatTier.miro
      const quote = tokenQuote(model, tier.maxOutputTokens, pricing)
      return { id: choiceId(model.id, long), name: displayName(model.providerModelId), length: tier.replyLength,
        maximumTokens: quote.maximumTokens, maxOutputTokens: quote.maxOutputTokens }
    }))
    return { freeReady: choices.length > 0, proReady: choices.length > 0, choices }
  } catch { return { freeReady: false, proReady: false, choices: [] as ChatModelChoice[] } }
}
/** Legacy product ids still resolve, but all dialogue now draws from the token wallet. */
export async function resolveChatModel(_userId: string, choice: string, adult = false) {
  const models = availableModels(adult)
  const pinned = adult ? undefined : process.env.MIRO_CHAT_MODEL_ID
  const first = pinned ? models.find(m => m.id === pinned) : models[0]
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
  const quote = tokenQuote(model, tier.maxOutputTokens, pricing)
  return { modelId: model.id, metered: true, tier, tierName, pricing, quote }
}
