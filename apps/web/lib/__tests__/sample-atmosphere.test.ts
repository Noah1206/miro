import { describe, expect, it } from 'vitest'
import { sampleDialogue, type DialogueEntry } from '../intro-dialogue'
import { sampleWithAtmosphere } from '../sample-atmosphere'
import { SEEDS } from '../../scripts/bl-characters.data.mjs'
import { SEEDS_2 } from '../../scripts/bl-characters-2.data.mjs'

describe('sample dialogue atmosphere', () => {
  it('adds two character-specific narrative beats while preserving all 14 characters’ original exchanges', () => {
    for (const seed of [...SEEDS, ...SEEDS_2]) {
      const original = sampleDialogue(seed.sampleDialogue)
      const snapshot = JSON.stringify(seed.sampleDialogue)
      const result = sampleWithAtmosphere(seed.slug, original)
      expect(result.filter(t => t.role === 'narrator'), seed.slug).toHaveLength(2)
      expect(result.filter(t => t.role !== 'narrator'), seed.slug).toEqual(original)
      expect(JSON.stringify(seed.sampleDialogue)).toBe(snapshot)
    }
  })
  it('keeps author narratives, edited dialogue, and actual intro entries intact', () => {
    const question: DialogueEntry = { role: 'user', text: '어떻게 찾았어요?' }
    const reply: DialogueEntry = { role: 'character', text: '사연이요.' }
    const authored: DialogueEntry[] = [question, { role: 'narrator', text: '직접 쓴 장면.' }, reply]
    expect(sampleWithAtmosphere('official-seo-ian', authored)).toEqual(authored)
    const edited: DialogueEntry[] = [{ ...question, text: '다른 질문이에요.' }, reply]
    expect(sampleWithAtmosphere('official-seo-ian', edited)).toEqual(edited)
    const intro: DialogueEntry[] = [question, { ...reply, purpose: 'intro' }]
    expect(sampleWithAtmosphere('official-seo-ian', intro)).toEqual(intro)
    expect(sampleWithAtmosphere('custom', [question, reply])).toEqual([question, reply])
  })
})
