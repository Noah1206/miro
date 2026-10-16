import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIBudgetDeniedError, AIContentBlockedError } from '@miro/providers'
import { UnsafeContentError } from '../../safety'
import { AgencyCompilationError, compileAuthoredCharacter, hashAuthoredCharacter } from '../compiler'
import { DOCUMENT, compileProposal, recordedProvider } from './fixtures'

afterEach(() => vi.unstubAllEnvs())

describe('authored character compilation', () => {
  it('repairs invalid source grounding once against the original document', async () => {
    const invalid = compileProposal()
    invalid.rules[0]!.source.quote = '없는 원문'
    const calls: Array<{ prompt: string }> = []
    const result = await compileAuthoredCharacter(recordedProvider([invalid, compileProposal()], calls), DOCUMENT, hashAuthoredCharacter(DOCUMENT))
    expect(result.compiled.rules).toHaveLength(2)
    expect(calls).toHaveLength(2)
    const repair = JSON.parse(calls[1]!.prompt)
    expect(repair.document).toEqual(DOCUMENT)
    expect(repair.repair.issues).toContainEqual({ field: 'rules.value-promise.source', reason: 'source_quote_not_found' })
  })

  it('propagates a budget failure during repair and never accepts partial rules', async () => {
    const invalid = compileProposal()
    invalid.rules[0]!.source.quote = '없는 원문'
    const denied = new AIBudgetDeniedError('repair_limit')
    await expect(compileAuthoredCharacter(recordedProvider([invalid, denied]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))).rejects.toBe(denied)
  })

  it('preserves exact raw fields and attaches server-computed spans, never labels replay as live', async () => {
    const calls: Array<{ task?: string; promptVersion?: string; prompt: string }> = []
    const result = await compileAuthoredCharacter(recordedProvider([compileProposal()], calls), DOCUMENT, hashAuthoredCharacter(DOCUMENT))
    expect(result.providerMode).toBe('mock')
    expect(result.document).toEqual(DOCUMENT)
    expect(result.document).not.toBe(DOCUMENT)
    expect(result.compiled.rules[0]?.source).toEqual({ field: 'personality.personality', start: 0, end: DOCUMENT.fields['personality.personality']!.length })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ task: 'agency_compile', promptVersion: 'agency-compiler:v3' })
    result.document.fields['identity.name'] = '수정'
    expect(DOCUMENT.fields['identity.name']).toBe('도윤')
  })

  // 10/2 운영: 예비 모델이 상한(32)을 넘겨 규칙을 내자 정리 전체가 실패했다 — 앞의 32개만 받는다.
  it('keeps the first 32 rules when a model returns more than the limit', async () => {
    const name = compileProposal().rules[1]!
    const many = { ...compileProposal(), rules: Array.from({ length: 40 }, (_, i) => ({ ...name, id: `name-${i}` })) }
    const result = await compileAuthoredCharacter(recordedProvider([many]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))
    expect(result.compiled.rules.map(rule => rule.id)).toEqual(Array.from({ length: 32 }, (_, i) => `name-${i}`))
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

  it('anchors a unique exact quote even when model offsets are wrong, without another model call', async () => {
    const quote = '약속을 지킨다.'
    const document = { fields: { personality: `🙂 서문\n${quote}\n끝.` }, explicitFields: ['personality'] }
    const proposal = { rules: [{ id: 'promise', domain: 'value', origin: 'explicit', statement: quote,
      source: { field: 'personality', quote, start: 5, end: 12 }, confidence: 1 }], unresolved: [] }
    const calls: Array<{ prompt: string }> = []
    const result = await compileAuthoredCharacter(recordedProvider([proposal], calls), document, hashAuthoredCharacter(document))
    const start = document.fields.personality.indexOf(quote)
    expect(result.compiled.rules[0]!.source).toEqual({ field: 'personality', start, end: start + quote.length })
    expect(result.compiled.rules[0]!.statement).toBe(quote)
    expect(result.document).toEqual(document)
    expect(calls).toHaveLength(1)
  })

  it('rejects an absent quote despite plausible offsets and never compiles just the remaining rules', async () => {
    const proposal = compileProposal()
    proposal.rules[0]!.source.quote = '존재하지 않는 원문'
    proposal.rules[0]!.source.start = 1
    proposal.rules[0]!.source.end = 3
    await expect(compileAuthoredCharacter(recordedProvider([proposal, proposal]), DOCUMENT, hashAuthoredCharacter(DOCUMENT)))
      .rejects.toMatchObject({ issues: expect.arrayContaining([{ field: 'rules.value-promise.source', reason: 'source_quote_not_found' }]) })
  })

  // 10/2: 작성자가 쓴 규칙의 문장은 모델 문장이 아니라 검증된 원문으로 바뀐다 — 원문과 다른 해석은 원문으로 돌아간다(전엔 정리 전체를 거부했다).
  it('stores an explicit rule as the author\'s exact words, whatever the model paraphrased', async () => {
    const proposal = compileProposal()
    proposal.rules[0]!.statement = '약속은 상황에 따라 무시한다.'
    proposal.rules[1]!.statement = '이름은 도윤이다.'
    const { compiled } = await compileAuthoredCharacter(recordedProvider([proposal, proposal]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))
    expect(compiled.rules.map(rule => rule.statement)).toEqual([DOCUMENT.fields['personality.personality'], '도윤'])
  })

  it('rejects invented exceptions and demographic motives', async () => {
    for (const modify of [
      (p: ReturnType<typeof compileProposal>) => { p.rules[0]!.exceptions = ['상대가 연락을 차단한 경우 무시한다'] },
      (p: ReturnType<typeof compileProposal>) => { p.rules[0]!.source = { field: 'identity.nationality', quote: '한국' }; p.rules[0]!.statement = '한국'; p.rules[0]!.exceptions = [] },
    ]) {
      const proposal = compileProposal(); modify(proposal)
      await expect(compileAuthoredCharacter(recordedProvider([proposal, proposal]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))).rejects.toBeInstanceOf(AgencyCompilationError)
    }
  })

  it('never turns inferred identity or inferred boundaries into canon', async () => {
    for (const domain of ['identity', 'boundary', 'world'] as const) {
      const proposal = compileProposal()
      proposal.rules[0]!.origin = 'inferred'; proposal.rules[0]!.domain = domain; proposal.rules[0]!.statement = '추정한 새로운 사실'
      await expect(compileAuthoredCharacter(recordedProvider([proposal, proposal]), DOCUMENT, hashAuthoredCharacter(DOCUMENT))).rejects.toBeInstanceOf(AgencyCompilationError)
    }
  })

  it('does not reinterpret an unmarked legacy field as an explicit author choice', async () => {
    const legacy = { ...DOCUMENT, explicitFields: ['identity.name'] }
    await expect(compileAuthoredCharacter(recordedProvider([compileProposal(), compileProposal()]), legacy, hashAuthoredCharacter(legacy))).rejects.toMatchObject({
      issues: expect.arrayContaining([{ field: 'rules.value-promise.origin', reason: 'unmarked_author_intent' }]),
    })
  })

  it('requires an explicit offset for repeated source quotations', async () => {
    const document = { fields: { personality: '약속 약속' }, explicitFields: ['personality'] }
    const proposal = { rules: [{ id: 'promise', domain: 'value', origin: 'explicit', statement: '약속', source: { field: 'personality', quote: '약속' }, confidence: 1 }], unresolved: [] }
    await expect(compileAuthoredCharacter(recordedProvider([proposal, proposal]), document, hashAuthoredCharacter(document))).rejects.toBeInstanceOf(AgencyCompilationError)
  })

  it('accepts only exact disambiguating offsets for a repeated quote', async () => {
    const document = { fields: { personality: '약속 약속' }, explicitFields: ['personality'] }
    const proposal = { rules: [{ id: 'promise', domain: 'value', origin: 'explicit', statement: '약속',
      source: { field: 'personality', quote: '약속', start: 1, end: 3 }, confidence: 1 }], unresolved: [] }
    await expect(compileAuthoredCharacter(recordedProvider([proposal, proposal]), document, hashAuthoredCharacter(document)))
      .rejects.toMatchObject({ issues: [{ field: 'rules.promise.source', reason: 'source_offset_mismatch' }, { field: 'rules', reason: 'no_grounded_rules' }] })
    proposal.rules[0]!.source.start = 3; proposal.rules[0]!.source.end = 5
    const result = await compileAuthoredCharacter(recordedProvider([proposal]), document, hashAuthoredCharacter(document))
    expect(result.compiled.rules[0]!.source).toEqual({ field: 'personality', start: 3, end: 5 })
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
