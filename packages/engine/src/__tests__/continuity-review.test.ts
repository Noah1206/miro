import { afterEach, describe, expect, it, vi } from 'vitest'
import { POLICY, tokenPricing, tokenQuote } from '@miro/config'
import { AnthropicProvider, createAI, GeminiProvider, generationInputCeiling, TurnMeter, type GenerationRequest } from '@miro/providers'
import definitions from '../../../../ai/models/miro-role-split.json'
import { runTurn } from '../orchestrator'
import { resolveTurnPolicy } from '../policy'
import { recordedConversationReview, snapshot } from './fixtures'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('ordinary chat policy through the shared provider resolver', () => {
  it.each([false, true])('reviews a short reply before delivery with continuity=%s and retains the scene cost envelope', async continuity => {
    vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify(definitions.map(model => model.tier !== 'small' ? model
      : { ...model, capabilities: [...model.capabilities, 'agency_verify'] })))
    vi.stubEnv('MIRO_AGENCY_VERIFY_MODEL_ID', 'claude-sonnet')
    vi.stubEnv('GEMINI_API_KEY', 'fixture-key'); vi.stubEnv('ANTHROPIC_API_KEY', 'fixture-key')
    vi.stubEnv('MIRO_SHADOW_MODEL', ''); vi.stubEnv('MIRO_CANARY_MODEL', '')
    vi.stubEnv('MIRO_USAGE_POLICY', ''); vi.stubEnv('MIRO_TOKEN_PRICING', '')
    const policy = resolveTurnPolicy({ experience: 'chat', tier: 'miro', channel: 'scene', agencyMode: 'off', agencyReady: false, continuity })
    const model = definitions.find(m => m.id === 'gemini-flash')!
    const quote = tokenQuote(model, POLICY.chatTier.miro.maxOutputTokens, tokenPricing())
    // This is the actual scene API shape: the selected dialogue model and quote remain in the
    // context, while the continuity policy limits rendered dialogue to 128 output tokens.
    const meter = new TurnMeter(quote.maximumUSD, quote.maxInputTokens, quote.maxOutputTokens)
    const calls: Array<{ provider: string; request: GenerationRequest }> = []
    const reply = '저는 잠깐 창문을 열어 두겠습니다.'
    const respond = (provider: string) => async (request: GenerationRequest) => {
      calls.push({ provider, request })
      const output = request.task === 'agency_verify' ? recordedConversationReview(request)
        : { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: reply }] } }
      return { text: JSON.stringify(output), provider, model: `${provider}-fixture`, inputTokens: 100, outputTokens: 50, latencyMs: 1 }
    }
    vi.spyOn(GeminiProvider.prototype, 'generate').mockImplementation(respond('gemini'))
    vi.spyOn(AnthropicProvider.prototype, 'generate').mockImplementation(respond('anthropic'))
    const llm = createAI({ mock: () => { throw new Error('unexpected mock fallback') }, context: { continuity, dialogueModelId: model.id, turnMeter: meter } })
    const visible: string[] = []
    const result = await runTurn({ llm, snapshot: snapshot({ experienceType: 'chat' }), userInput: '오늘은 잠깐 이야기해요.', policy,
      stream: { onBlocks: blocks => {
        expect(calls.map(c => c.request.task)).toEqual(['dialogue', 'agency_verify'])
        visible.push(...blocks.map(b => b.text))
      }, onReset() {} } })
    expect(result.providerMode).toBe('live')
    expect(visible).toEqual([reply])
    expect(calls.map(c => c.provider)).toEqual(['gemini', continuity ? 'gemini' : 'anthropic'])
    expect(calls[0]!.request.maxTokens).toBe(continuity ? 128 : POLICY.chatTier.miro.maxOutputTokens)
    expect(calls[1]!.request).toMatchObject({ task: 'agency_verify', maxTokens: 1536, thinking: 'medium', hardTokenCap: true })
    expect(generationInputCeiling(calls[1]!.request)).toBeLessThanOrEqual(24_000)
    expect(llm.lastModelId).toBe(continuity ? 'gemini-flash-lite' : 'claude-sonnet')
    expect(meter.limitUSD).toBe(quote.maximumUSD)
    expect(meter.maxInputTokens).toBe(quote.maxInputTokens)
    expect(meter.maxOutputTokens).toBe(quote.maxOutputTokens)
    expect(meter.customerCostUSD).toBeGreaterThan(0)
    expect(meter.customerCostUSD).toBeLessThan(meter.limitUSD)
  })
})
