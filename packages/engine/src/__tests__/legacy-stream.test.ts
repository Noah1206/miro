import { afterEach, expect, it, vi } from 'vitest'
import { AIOrchestrator } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { SimulationProposal } from '../proposal.schema'
import { snapshot } from './fixtures'

afterEach(() => vi.unstubAllEnvs())
it.each(['chat', 'messenger'] as const)('passes completed %s blocks before provider completion', async mode => {
  vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', '0')
  const stream = { onBlocks: vi.fn(), onReset: vi.fn() }
  const proposal = SimulationProposal.parse({ rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '마침 읽던 책이 있습니다.' }, { type: 'dialogue', speaker: '토마스', text: '이쪽에서 함께 보시겠습니까?' }] } })
  const provider = { info: { mode: 'mock' as const, name: 'stream-fixture', notice: null }, healthCheck: async () => true,
    generate: async (req: { onText?: (text: string) => void }) => {
      req.onText?.('{"rp":{"blocks":[' + JSON.stringify(proposal.rp.blocks[0]) + ',')
      expect(stream.onBlocks).toHaveBeenCalledWith([proposal.rp.blocks[0]])
      return { text: JSON.stringify(proposal), provider: 'mock', model: 'fixture', inputTokens: 5, outputTokens: 5, latencyMs: 0, truncated: false }
    } }
  const result = await runTurn({ llm: new AIOrchestrator({ chain: [provider], maxRetries: 0 }), snapshot: snapshot({ mode, experienceType: 'chat' }), userInput: '어떤 책을 읽고 계세요?', stream })
  expect(result.providerMode).toBe('mock')
  expect(stream.onBlocks.mock.calls.at(-1)![0]).toHaveLength(2)
})
