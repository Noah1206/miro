import { registryFromEnv } from '@miro/providers'
import { effectivePlan } from '@/lib/usage/guard'

export type ChatModel = 'miro' | 'pro'
/** Product choices map to server-owned model IDs, never browser-supplied provider names. */
function configuredModels() {
  const { registry } = registryFromEnv(() => '')
  const available = registry.models.filter(m => m.enabled && m.capabilities.includes('dialogue'))
  const free = process.env.MIRO_CHAT_FREE_MODEL_ID
    ? available.find(m => m.id === process.env.MIRO_CHAT_FREE_MODEL_ID)
    : available.find(m => m.tier !== 'premium')
  const pro = process.env.MIRO_CHAT_PRO_MODEL_ID
    ? available.find(m => m.id === process.env.MIRO_CHAT_PRO_MODEL_ID)
    : available.find(m => m.tier === 'premium')
  return { free, pro: pro && pro.id !== free?.id ? pro : undefined }
}
export async function chatModelOptions(userId: string) {
  const plan = await effectivePlan(userId)
  try {
    const { free, pro } = configuredModels()
    return { freeReady: !!free, proReady: !!pro, isPro: plan === 'pro' }
  } catch { return { freeReady: false, proReady: false, isPro: plan === 'pro' } }
}
export async function resolveChatModel(userId: string, choice: string): Promise<string> {
  if (choice !== 'miro' && choice !== 'pro') throw new Error('invalid chat model')
  if (choice === 'pro' && await effectivePlan(userId) !== 'pro') throw new Error('pro required')
  const models = configuredModels()
  const model = choice === 'pro' ? models.pro : models.free
  if (!model) throw new Error('chat model unavailable')
  return model.id
}
