import { registryFromEnv } from '@miro/providers'
import { POLICY } from '@miro/config'

export type ChatModel = 'miro' | 'pro'
export type ChatTier = typeof POLICY.chatTier.miro | typeof POLICY.chatTier.echo

/**
 * 대화에 쓸 모델. MIRO 와 ECHO 는 같은 모델을 공유한다 —
 * 두 상품의 차이는 모델이 아니라 한 턴에 들이는 양(chatTier)이다.
 *
 * MIRO_CHAT_MODEL_ID 로 고정할 수 있고, 없으면 dialogue 가능한 첫 모델을 쓴다. 예비 모델은 고르는 대상이 아니다 — 장애 때 오케스트레이터가 쓴다.
 */
function dialogueModel() {
  const { registry } = registryFromEnv(() => '')
  const available = registry.models.filter(m => m.enabled && !m.fallback && m.capabilities.includes('dialogue'))
  const pinned = process.env.MIRO_CHAT_MODEL_ID
  return pinned ? available.find(m => m.id === pinned) : available[0]
}

/** ECHO 는 요금제와 무관하게 누구나 고른다(2026-09-29 결정) — 차이는 한 턴에 사용량이 차감되느냐뿐이다. */
export async function chatModelOptions(_userId: string) {
  try {
    const model = dialogueModel()
    // 같은 모델을 쓰므로 하나가 준비되면 둘 다 준비된다.
    return { freeReady: !!model, proReady: !!model }
  } catch { return { freeReady: false, proReady: false } }
}

/**
 * Resolves the browser's product choice to a model and a generation tier.
 *
 * `metered` decides whether the turn draws down the user's monthly allowance,
 * and both it and the tier are derived from the server-validated choice —
 * never from a flag the browser sends. MIRO is unmetered; ECHO is not.
 */
export async function resolveChatModel(_userId: string, choice: string): Promise<{ modelId: string; metered: boolean; tier: ChatTier }> {
  if (choice !== 'miro' && choice !== 'pro') throw new Error('invalid chat model')
  const model = dialogueModel()
  if (!model) throw new Error('chat model unavailable')
  return { modelId: model.id, metered: choice === 'pro', tier: choice === 'pro' ? POLICY.chatTier.echo : POLICY.chatTier.miro }
}
