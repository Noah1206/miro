import { describe, expect, it } from 'vitest'
import { buildMockProposal } from '../mock-rp'
import { repeatedConversationBlock } from '../conversation-repetition'

describe('mock scene continuity', () => {
  it('keeps synthetic follow-up turns usable without bypassing repetition validation', () => {
    const history: Array<{ role: string; content: string; blocks: ReturnType<typeof buildMockProposal>['rp']['blocks'] }> = []
    for (let turn = 0; turn < 6; turn++) {
      const prompt = `정서적 거리 45\n신뢰 40\n턴 ${turn}\n` + history.slice(-3).map(h => h.blocks.map(b => b.text).join('\n')).join('\n')
      const result = buildMockProposal(prompt, { characterName: '토마스' })
      expect(repeatedConversationBlock(result.rp.blocks, history, `새 입력 ${turn}`, '토마스')).toBeNull()
      history.push({ role: 'character', content: '', blocks: result.rp.blocks })
    }
  })
})
