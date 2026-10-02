import { describe, expect, it } from 'vitest'
import { AIOrchestrator, MockAIProvider, type GenerationRequest, type LLMProvider } from '@miro/providers'
import type { RelationshipProfile } from '@miro/domain'
import { runTurn } from '../orchestrator'
import { buildMockProposal } from '../mock-rp'
import { compileRelationshipProfile, profileFromAnswer, temperamentHash, temperamentSource } from '../relationship-profile'
import { character, relationship, snapshot } from './fixtures'

const source = temperamentSource({
  name: '강태준', personality: '침착하고 관찰력이 좋다. 신뢰와 약속을 중시하고, 가까운 사람을 지키려는 책임감이 강하다. 상대의 선택을 존중하고 강요하지 않는다.',
  dislikes: ['아부'], hobbies: [], values: null,
})
const now = new Date('2026-09-29T12:00:00.000Z')

describe('관계 성격표 만들기', () => {
  it('keeps only slots grounded in the author\'s words and within the choices', () => {
    const p = profileFromAnswer({
      reactions: [
        { event: 'broke_promise', level: 'extreme', quote: '신뢰와 약속을 중시하고' },
        { event: 'compliment', level: 'averse', quote: '“아부”' },
        { event: 'lied', level: 'averse', quote: '신뢰와 약속을 중시하고' },
        { event: 'hostility', level: 'high', quote: '쉽게 화를 낸다' },
        { event: 'apologized', level: 'normal', quote: '침착하고' },
        { event: 'broke_promise', level: 'low', quote: '신뢰와 약속을 중시하고' },
        'garbage',
      ],
      grows: [{ dimension: 'protectiveness', quote: '가까운 사람을 지키려는   책임감이 강하다' }, { dimension: 'trust', quote: '강태준' }],
      pace: [{ aspect: 'romance', value: 'quick', quote: '침착하고' }, { aspect: 'forgiveness', value: 'slow', quote: '신뢰와 약속을 중시하고' }],
      moods: [{ mood: 'jealous', expression: '캐묻지 않는다. 괜찮은 사람이냐고 한 번만 묻는다.', quote: '상대의 선택을 존중하고 강요하지 않는다.' }],
      reachOut: [
        { rule: 'jealousy_spike', on: false, reason: '', quote: '상대의 선택을 존중하고' },
        { rule: 'after_scene', on: true, reason: '', quote: '가까운 사람을 지키려는' },
      ],
    }, source, 'hash', now)
    expect(p.reactions).toEqual({
      broke_promise: { value: 'extreme', by: 'ai', quote: '신뢰와 약속을 중시하고' },
      compliment: { value: 'averse', by: 'ai', quote: '아부' },
    })
    expect(Object.keys(p.grows)).toEqual(['protectiveness'])  // 이름은 근거가 아니다
    expect(p.romance).toBeUndefined()                        // 선택지 밖
    expect(p.forgiveness?.value).toBe('slow')
    expect(p.moods.jealous?.value).toContain('캐묻지 않는다')
    expect(Object.keys(p.reachOut)).toEqual(['jealousy_spike'])  // 켜진 채 이유 없는 칸은 기본과 같다
    expect(p.sourceHash).toBe('hash')
    expect(p.generatedAt).toBe(now.toISOString())
  })

  it('a wrong first answer for a slot does not block a right one after it', () => {
    const p = profileFromAnswer({
      reactions: [{ event: 'lied', level: 'averse', quote: '신뢰와 약속을 중시하고' }, { event: 'lied', level: 'extreme', quote: '신뢰와 약속을 중시하고' }],
      grows: [], moods: [], reachOut: [],
      pace: [{ aspect: 'opening', value: 'never', quote: '침착하고' }, { aspect: 'opening', value: 'slow', quote: '침착하고' },
        { aspect: 'turningPoint', value: 'lied', quote: '침착하고' }, { aspect: 'turningPoint', value: 'made_promise', quote: '신뢰와 약속을 중시하고' },
        { aspect: 'forgiveness', value: 'normal', quote: '침착하고' }],
    }, source, 'hash', now)
    expect(p.reactions.lied?.value).toBe('extreme')
    expect(p.opening?.value).toBe('slow')
    expect(p.turningPoint?.value).toBe('made_promise')
    expect(p.forgiveness).toBeUndefined()   // 보통은 기본과 같아 싣지 않는다
  })

  it('asks the dialogue model once with a decoding schema and stamps the source fingerprint', async () => {
    const seen: Array<Record<string, unknown>> = []
    const llm: LLMProvider = { info: { mode: 'live', name: 'test', notice: null }, generateStructured: async (opts: Record<string, unknown>) => {
      seen.push(opts)
      return { reactions: [{ event: 'broke_promise', level: 'high', quote: '약속을 중시하고' }] }
    } } as never
    const p = await compileRelationshipProfile(llm, source, now)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.task).toBe('dialogue')
    expect(seen[0]!.thinking).toBe('medium')   // 성격에서 반응을 추론하는 일 — 대사(low)보다 생각을 더 한다
    expect(seen[0]!.responseSchema).toBeTruthy()
    expect(String(seen[0]!.prompt)).toContain('신뢰와 약속을 중시하고')
    expect(p.sourceHash).toBe(temperamentHash(source))
    expect(p.reactions.broke_promise?.value).toBe('high')
    expect(temperamentHash(temperamentSource({ name: '강태준', personality: '다른 성격' }))).not.toBe(p.sourceHash)
  })
})

describe('같은 턴, 다른 캐릭터', () => {
  const llm = new AIOrchestrator({ chain: [new MockAIProvider((req: GenerationRequest) => buildMockProposal(req.prompt, { characterName: '토마스' }))] })
  const table = (over: Partial<RelationshipProfile>): RelationshipProfile =>
    ({ version: 1, sourceHash: 'h', generatedAt: now.toISOString(), reactions: {}, grows: {}, moods: {}, reachOut: {}, ...over })
  const respectful = table({
    reactions: { mentioned_other_romantic_interest: { value: 'low', by: 'ai' } },
    moods: { jealous: { value: '캐묻지 않는다. 말수가 줄고, 괜찮은 사람이냐고 한 번만 묻는다.', by: 'ai' } },
  })
  const possessive = table({ reactions: { mentioned_other_romantic_interest: { value: 'extreme', by: 'ai' } } })
  const turn = (p: RelationshipProfile | null) => runTurn({
    llm, userInput: '나 어제 소개팅 갔다 왔어',
    snapshot: snapshot({ character: character({ jealousy: 50, emotionalExpression: 50, relationshipProfile: p }), relationship: relationship({ jealousy: 30 }) }),
  })

  it('moves the relationship by each character\'s own table and prompts each one\'s own way of showing it', async () => {
    const [plain, calm, clingy] = await Promise.all([turn(null), turn(respectful), turn(possessive)])
    expect(calm.transition.relationshipDelta.jealousy!).toBeLessThan(plain.transition.relationshipDelta.jealousy!)
    expect(clingy.transition.relationshipDelta.jealousy!).toBeGreaterThan(plain.transition.relationshipDelta.jealousy!)
    expect(calm.context.prompt).toContain('캐묻지 않는다')
    expect(plain.context.prompt).toContain('되묻는다')
  })
})
