import { afterEach, describe, expect, it, vi } from 'vitest'
import { feature } from '@miro/config'
import type { LLMProvider } from '@miro/providers'
import { needsUserGroundingReview } from '../conversation-grounding'
import { verifyCommunicationPreferences } from '../agency/realization'

afterEach(() => vi.unstubAllEnvs())

describe('experimental conversation review rollout', () => {
  it('keeps the unvalidated source ledger off by default in production and alpha', () => {
    vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', undefined)
    for (const mode of ['production', 'alpha']) {
      vi.stubEnv('MIRO_MODE', mode)
      expect(feature('strictConversationReview')).toBe(false)
      expect(needsUserGroundingReview([{ type: 'dialogue', text: '평범한 대화' }])).toBe(false)
    }
  })

  it('retains the deployed small explicit-preference check while the ledger is off', async () => {
    vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', '0')
    const llm: LLMProvider = { info: { mode: 'mock', name: 'rollout-contract', notice: '' }, async generateStructured(request) {
      expect(request.promptVersion).toBe('agency-communication-check:v3')
      expect(request.maxTokens).toBe(192)
      const data = JSON.parse(request.prompt)
      expect(data.preferenceEvidence[0].text).toBe('과한 별명 대신 민이라고 불러 줘.')
      expect(data).not.toHaveProperty('groundingEvidence')
      return request.schema.parse({ acceptable: false, blockIndex: 0 })
    } }
    const result = await verifyCommunicationPreferences(llm, {
      evidence: [{ sourceId: 'user', text: '과한 별명 대신 민이라고 불러 줘.', kind: 'user_quote', occurredAt: null }],
      recentUserMessages: [], groundingEvidence: [], blocks: [{ text: '우리 아기 왔어?', type: 'dialogue', speaker: '캐릭터' }],
    })
    expect(result).toMatchObject({ acceptable: false, reason: 'violates_boundary', claimsChecked: 0 })
  })

  it('requires an explicit opt-in to run the full source review', () => {
    vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', '1')
    expect(needsUserGroundingReview([{ type: 'dialogue', text: '평범한 대화' }])).toBe(true)
  })

  it('accepts a deployment value saved with a trailing newline', () => {
    vi.stubEnv('MIRO_MODE', 'production')
    vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', '1\n')
    expect(feature('strictConversationReview')).toBe(true)
  })
})
