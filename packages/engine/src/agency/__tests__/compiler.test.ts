import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIBudgetDeniedError, AIContentBlockedError } from '@miro/providers'
import { UnsafeContentError } from '../../safety'
import { AgencyCompilationError, compileAuthoredCharacter, hashAuthoredCharacter } from '../compiler'
import { DOCUMENT, compileProposal, recordedProvider } from './fixtures'

afterEach(() => vi.unstubAllEnvs())

describe('authored character compilation', () => {
  it('preserves exact raw fields and attaches server-computed spans, never labels replay as live', async () => {
    const calls: Array<{ task?: string; promptVersion?: string; prompt: string }> = []
    const result = await compileAuthoredCharacter(recordedProvider([compileProposal()], calls), DOCUMENT, hashAuthoredCharacter(DOCUMENT))
    expect(result.providerMode).toBe('mock')
    expect(result.document).toEqual(DOCUMENT)
    expect(result.document).not.toBe(DOCUMENT)
    expect(result.compiled.rules[0]?.source).toEqual({ field: 'personality.personality', start: 0, end: DOCUMENT.fields['personality.personality']!.length })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ task: 'world_update', promptVersion: 'agency-compiler:v1' })
    result.document.fields['identity.name'] = '수정'
    expect(DOCUMENT.fields['identity.name']).toBe('도윤')
  })

  it('hashes field order consistently, but never normalizes substantive raw text', () => {
    const reversed = { fields: Object.fromEntries(Object.entries(DOCUMENT.fields).reverse()), explicitFields: [...DOCUMENT.explicitFields].reverse() }
    expect(hashAuthoredCharacter(reversed)).toBe(hashAuthoredCharacter(DOCUMENT))
    expect(hashAuthoredCharacter({ ...DOCUMENT, fields: { ...DOCUMENT.fields, 'identity.name': ' 도윤' } })).not.toBe(hashAuthoredCharacter(DOCUMENT))
  })

  it('refuses stale queued source before any model call', async () => {
    const calls: [] = []
    await expect(compileAuthoredCharacter(recordedProvider([], calls), DOCUMENT, 'stale')).rejects.toMatchObject({ issues: [{ reason: 'source_hash_mismatch' }] })
    expect(calls).toHaveLength(0)
  })

  it('rejects fabricated source spans and does not silently compile the remaining rules', async () => {
    const proposal = compileProposal()
    proposal.rules[0]!.source.start = 1
    proposal.rules[0]!.source.end = 3
    await expect(compileAuthoredCharacter(recordedProvider([proposal]), DOCUMENT, hashAuthoredCharacter(DOCUMENT)))
      .rejects.toMatchObject({ issues: expect.arrayContaining([{ field: 'rules.value-promise.source', reason: 'source_span_mismatch' }]) })
  })

  it('rejects paraphrased explicit facts, invented exceptions and demographic motives', async () => {
    for (const modify of [
      (p: ReturnType<typeof compileProposal>) => { p.rules[0]!.statement = '약속은 상황에 따라 무시한다.' },
      (p: ReturnType<typeof compileProposal>) => { p.rules[0]!.exceptions = ['상대가 연락을 차단한 경우 무시한다'] },
      (p: ReturnType<typeof compileProposal>) => { p.rules[0]!.source = { field: 'identity.nationality', quote: '한국' }; p.rules[0]!.statement = '한국'; p.rules[0]!.exceptions = [] },
    ]) {
      const proposal = compileProposal(); modify(proposal)
      await expect(compileAuthoredCharacter(recordedProvider([proposal]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))).rejects.toBeInstanceOf(AgencyCompilationError)
    }
  })

  it('never turns inferred identity or inferred boundaries into canon', async () => {
    for (const domain of ['identity', 'boundary', 'world'] as const) {
      const proposal = compileProposal()
      proposal.rules[0]!.origin = 'inferred'; proposal.rules[0]!.domain = domain; proposal.rules[0]!.statement = '추정한 새로운 사실'
      await expect(compileAuthoredCharacter(recordedProvider([proposal]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))).rejects.toBeInstanceOf(AgencyCompilationError)
    }
  })

  it('does not reinterpret an unmarked legacy field as an explicit author choice', async () => {
    const legacy = { ...DOCUMENT, explicitFields: ['identity.name'] }
    await expect(compileAuthoredCharacter(recordedProvider([compileProposal()]), legacy, hashAuthoredCharacter(legacy))).rejects.toMatchObject({
      issues: expect.arrayContaining([{ field: 'rules.value-promise.origin', reason: 'unmarked_author_intent' }]),
    })
  })

  it('requires an explicit offset for repeated source quotations', async () => {
    const document = { fields: { personality: '약속 약속' }, explicitFields: ['personality'] }
    const proposal = { rules: [{ id: 'promise', domain: 'value', origin: 'explicit', statement: '약속', source: { field: 'personality', quote: '약속' }, confidence: 1 }], unresolved: [] }
    await expect(compileAuthoredCharacter(recordedProvider([proposal]), document, hashAuthoredCharacter(document))).rejects.toBeInstanceOf(AgencyCompilationError)
  })

  it('propagates budget and safety failures instead of creating a successful mock spec', async () => {
    const budget = new AIBudgetDeniedError('test_limit')
    await expect(compileAuthoredCharacter(recordedProvider([budget]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))).rejects.toBe(budget)
    await expect(compileAuthoredCharacter(recordedProvider([new AIContentBlockedError()]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))).rejects.toBeInstanceOf(UnsafeContentError)
  })

  it('rejects unbounded source input before model calls', async () => {
    expect(() => hashAuthoredCharacter({ fields: { personality: '가'.repeat(12_001) }, explicitFields: ['personality'] })).toThrow()
  })

  it('preserves a full indexed lorebook and scenario examples within the aggregate source budget', async () => {
    const fields: Record<string, string> = { ...DOCUMENT.fields,
      'identity.age': '30', 'identity.occupation': '서점 직원', 'identity.mbti': 'ISTJ',
      'personality.values': '약속을 지킨다.', 'personality.speechStyle': '존대',
      'personality.jealousy': '50', 'personality.initiative': '50', 'personality.emotionalExpression': '50',
      'personality.hobbies': '["독서"]', 'personality.dislikes': '["소음"]',
    }
    // String arrays remain one bounded field; lore and dialogue object entries are indexed.
    for (let index = 0; index < 24; index++) {
      fields[`worldRole.lore.${index}.content`] = '가'.repeat(600)
      fields[`worldRole.lore.${index}.keywords`] = JSON.stringify(Array.from({ length: 8 }, (_, keyword) => `단어${keyword}`))
    }
    for (let index = 0; index < 20; index++) {
      fields[`worldRole.sampleDialogue.${index}.role`] = 'character'
      fields[`worldRole.sampleDialogue.${index}.text`] = '나'.repeat(500)
    }
    const authored = { fields, explicitFields: Object.keys(fields) }
    const result = await compileAuthoredCharacter(recordedProvider([compileProposal()]), authored, hashAuthoredCharacter(authored))
    expect(result.document.fields['worldRole.lore.23.content']).toHaveLength(600)
    expect(result.document.fields['worldRole.sampleDialogue.19.text']).toHaveLength(500)
    expect(Object.keys(result.document.fields).length).toBeGreaterThan(96)
  })
})
