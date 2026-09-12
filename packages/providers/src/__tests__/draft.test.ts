import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CharacterDraft } from '../character/draft.schema'
import { buildMockDraft, generateCharacterDraft } from '../character/generate'
import { MockLLMProvider } from '../mock/llm'
import { MockImageProvider } from '../mock/image'
import { GatewayLLMProvider } from '../llm/gateway'

describe('character draft', () => {
  it('mock output satisfies the schema', () => {
    expect(CharacterDraft.safeParse(buildMockDraft('설명: 까칠한 검사')).success).toBe(true)
  })

  it('T6: a new character never starts out in love', () => {
    for (const s of ['까칠한 검사', '다정한 의사', '위험한 조직 간부', '첫사랑 같은 선배']) {
      const d = buildMockDraft(`설명: ${s}`)
      expect(d.initialRelationship.attraction).toBeLessThanOrEqual(20)
      expect(d.initialRelationship.attachment).toBeLessThanOrEqual(20)
      expect(d.initialRelationship.emotionalDistance).toBeGreaterThanOrEqual(55)
      expect(['stranger', 'acquaintance', 'professional'])
        .toContain(d.initialRelationship.stage)
    }
  })

  it('different descriptions produce different characters', () => {
    const a = buildMockDraft('설명: 까칠한 검사')
    const b = buildMockDraft('설명: 다정한 의사')
    expect(a.identity.name).not.toBe(b.identity.name)
  })

  it('the same description is deterministic', () => {
    expect(buildMockDraft('설명: 까칠한 검사'))
      .toEqual(buildMockDraft('설명: 까칠한 검사'))
  })

  it('goes through the provider interface', async () => {
    const llm = new MockLLMProvider(buildMockDraft)
    const draft = await generateCharacterDraft(llm, '다른 사람에겐 싸가지 없는데 나한테만 잘해주는 30살 검사')
    expect(draft.identity.name).toContain('초안')
    expect(draft.world.location).toBeTruthy()
  })

  it('rejects a draft that violates the schema instead of passing it through', async () => {
    const bad = new MockLLMProvider(() => ({ identity: { name: '' } }))
    await expect(
      bad.generateStructured({ schema: CharacterDraft, system: '', prompt: '' }),
    ).rejects.toThrow(/schema/)
  })
})

describe('provider transparency', () => {
  it('mock providers announce that they are not real generation', () => {
    expect(new MockLLMProvider(buildMockDraft).info.mode).toBe('mock')
    expect(new MockLLMProvider(buildMockDraft).info.notice).toMatch(/Mock/)
    expect(new MockImageProvider().info.mode).toBe('mock')
  })

  it('a configured gateway provider reports itself as live', () => {
    const p = new GatewayLLMProvider('key', 'anthropic/claude-sonnet-5')
    expect(p.info.mode).toBe('live')
    expect(p.info.notice).toBeNull()
    expect(p.info.name).toBe('anthropic/claude-sonnet-5')
  })
})

describe('image cache behaviour', () => {
  it('the same sceneKey yields the same asset, so no new generation is spent', async () => {
    const img = new MockImageProvider()
    const a = await img.generate({ prompt: 'x', sceneKey: 'tokyo|night|tense|rain', aspect: '3:4' })
    const b = await img.generate({ prompt: 'y', sceneKey: 'tokyo|night|tense|rain', aspect: '3:4' })
    expect(a.url).toBe(b.url)
  })

  it('a different scene yields a different asset', async () => {
    const img = new MockImageProvider()
    const a = await img.generate({ prompt: 'x', sceneKey: 'tokyo|night', aspect: '3:4' })
    const b = await img.generate({ prompt: 'x', sceneKey: 'seoul|night', aspect: '3:4' })
    expect(a.url).not.toBe(b.url)
  })
})

describe('gateway retry', () => {
  it('stops after the retry budget instead of looping forever', async () => {
    let calls = 0
    const fetchMock = async () => {
      calls++
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"nope":1}' } }] }),
        { status: 200 },
      )
    }
    const original = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch
    try {
      const p = new GatewayLLMProvider('k', 'test/model')
      await expect(
        p.generateStructured({ schema: z.object({ ok: z.string() }), system: '', prompt: '', maxRetries: 1 }),
      ).rejects.toThrow(/failed after 2 attempts/)
      expect(calls).toBe(2)
    } finally {
      globalThis.fetch = original
    }
  })
})
