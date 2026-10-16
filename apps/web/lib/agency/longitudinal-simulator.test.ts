import { describe, expect, it } from 'vitest'
import { AIOrchestrator } from '@miro/providers'
import type { AIProvider, GenerationRequest } from '@miro/providers'
import { longitudinalSimulatorRequest } from './longitudinal-simulator'

const context = { user: { name: '윤서', age: 28 }, character: { name: '차도겸', introduction: '경호회사 대표' },
  intent: '상대의 제안을 듣고 자기 의견을 낸다.', recent: [{ user: '다음에 같이 걸을래?', character: '안전한 길부터 알아보겠습니다.' }] }
function provider(text: string, seen: GenerationRequest[]): AIProvider {
  return { info: { mode: 'live', name: 'simulator-contract-unit-fixture', notice: null }, healthCheck: async () => true,
    generate: async request => { seen.push(request); return { text, provider: 'unit-fixture', model: 'unit-fixture', inputTokens: 1, outputTokens: 1, latencyMs: 0 } } }
}

describe('longitudinal user simulator output contract', () => {
  it('sends a required string input schema to the provider and preserves the response-aware context', async () => {
    const seen: GenerationRequest[] = []
    const ai = new AIOrchestrator({ chain: [provider('{"input":"좋아. 너무 멀리 가지는 말자."}', seen)], maxRetries: 0 })
    await expect(ai.generateStructured(longitudinalSimulatorRequest(context))).resolves.toEqual({ input: '좋아. 너무 멀리 가지는 말자.' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ json: true, promptVersion: 'longitudinal-user:v2', responseSchema: {
      type: 'object', required: ['input'], additionalProperties: false, properties: { input: { type: 'string' } },
    } })
    expect(seen[0]!.system).toContain('{"input":"사용자의 다음 발화"}')
    expect(seen[0]!.system).toContain('1~3문장의 한국어')
    expect(JSON.parse(seen[0]!.prompt)).toEqual(context)
  })

  it.each(['{"message":"좋아"}', '{"input":["좋아"]}', '{"input":"   "}', '{"input":"좋아","role":"user"}'])
    ('does not turn malformed simulation output into a successful user input: %s', async text => {
      const seen: GenerationRequest[] = []
      const ai = new AIOrchestrator({ chain: [provider(text, seen)], maxRetries: 0 })
      await expect(ai.generateStructured(longitudinalSimulatorRequest(context))).rejects.toThrow('invalid_schema')
      expect(seen).toHaveLength(1)
    })
})
