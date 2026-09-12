import { MockLLMProvider, resolveLLM, type LLMProvider } from '@miro/providers'
import { buildMockProposal } from '@miro/engine'

/** RP 용 Provider. 미구성 시 RP 전용 Mock 으로 떨어진다. */
export function resolveRpLLM(characterName: string): LLMProvider {
  const configured = resolveLLM()
  if (configured.info.mode === 'live') return configured
  return new MockLLMProvider((prompt) => buildMockProposal(prompt, { characterName }))
}
