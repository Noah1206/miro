import { beforeEach, describe, expect, it, vi } from 'vitest'
const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class {
  static APIError = class extends Error {}
  beta = { messages: { create } }
} }))
import { AnthropicProvider } from '../ai/anthropic'

beforeEach(() => {
  create.mockReset().mockResolvedValue({ model: 'actual-sonnet-version', content: [{ type: 'text', text: '{}' }],
    stop_reason: 'end_turn', usage: { input_tokens: 20, output_tokens: 15 } })
})
describe('Anthropic server-side fallback for a pinned review task', () => {
  it('omits provider model substitution only for a trusted pin and preserves medium effort and the hard cap', async () => {
    const provider = new AnthropicProvider('fixture-key', 'configured-sonnet')
    const result = await provider.generate({ task: 'agency_verify', system: 'system', prompt: 'input', maxTokens: 1536,
      thinking: 'medium', hardTokenCap: true, disableProviderFallback: true })
    const sent = create.mock.calls[0]![0]
    expect(sent).toMatchObject({ model: 'configured-sonnet', max_tokens: 1536, output_config: { effort: 'medium' } })
    expect(sent).not.toHaveProperty('fallbacks')
    expect(sent).not.toHaveProperty('betas')
    expect(result).toMatchObject({ model: 'actual-sonnet-version', inputTokens: 20, outputTokens: 15 })
  })

  it('preserves the existing server-side fallback for ordinary dialogue', async () => {
    await new AnthropicProvider('fixture-key', 'configured-sonnet').generate({ task: 'dialogue', system: '', prompt: '', maxTokens: 2048 })
    expect(create.mock.calls[0]![0]).toMatchObject({ max_tokens: 2048, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low' } })
  })
  it('accounts for Fable cache reads as discounted input and returns the actual model identity', async () => {
    create.mockResolvedValueOnce({ model: 'claude-fable-5-1', content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn',
      usage: { input_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 0, output_tokens: 15 } })
    const result = await new AnthropicProvider('fixture-key', 'claude-fable-5-1').generate({ task: 'dialogue', system: '', prompt: '', disableProviderFallback: true })
    expect(result).toMatchObject({ model: 'claude-fable-5-1', inputTokens: 100, cachedInputTokens: 80, outputTokens: 15 })
  })
})
