import { registryFromEnv } from '@miro/providers'
import { POLICY } from '@miro/config'
import { effectivePlan } from '@/lib/usage/guard'

export type ChatModel = 'miro' | 'pro'
export type ChatTier = typeof POLICY.chatTier.miro | typeof POLICY.chatTier.echo

/**
 * 대화에 쓸 모델. MIRO 와 ECHO 는 같은 모델을 공유한다 —
 * 두 상품의 차이는 모델이 아니라 한 턴에 들이는 양(chatTier)이다.
 *
 * MIRO_CHAT_MODEL_ID 로 고정할 수 있고, 없으면 dialogue 가능한 첫 모델을 쓴다.
 */
function dialogueModel() {
  const { registry } = registryFromEnv(() => '')
  const available = registry.models.filter(m => m.enabled && m.capabilities.includes('dialogue'))
  const pinned = process.env.MIRO_CHAT_MODEL_ID
  return pinned ? available.find(m => m.id === pinned) : available[0]
}

export async function chatModelOptions(userId: string) {
  const plan = await effectivePlan(userId)
  try {
    const model = dialogueModel()
    // 같은 모델을 쓰므로 하나가 준비되면 둘 다 준비된다.
    return { freeReady: !!model, proReady: !!model, isPro: plan === 'pro' }
  } catch { return { freeReady: false, proReady: false, isPro: plan === 'pro' } }
}

/**
 * Resolves the browser's product choice to a model and a generation tier.
 *
 * `metered` decides whether the turn draws down the user's monthly allowance,
 * and both it and the tier are derived from the server-validated choice —
 * never from a flag the browser sends. MIRO is unmetered; ECHO is not.
 */
export async function resolveChatModel(userId: string, choice: string): Promise<{ modelId: string; metered: boolean; tier: ChatTier }> {
  if (choice !== 'miro' && choice !== 'pro') throw new Error('invalid chat model')
  if (choice === 'pro' && await effectivePlan(userId) !== 'pro') throw new Error('pro required')
  const model = dialogueModel()
  if (!model) throw new Error('chat model unavailable')
  return { modelId: model.id, metered: choice === 'pro', tier: choice === 'pro' ? POLICY.chatTier.echo : POLICY.chatTier.miro }
}
