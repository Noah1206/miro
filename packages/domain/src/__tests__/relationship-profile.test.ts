import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER_STATE, EVENT_RULES, REACH_OUT_RULES, authoredCharacter, companionshipDelta, deltaFromSemanticEvents, deriveCharacterState,
  evaluateEventRules, keepAuthorItems, moodGuide, nextRelationshipStage, parseRelationshipProfile, withRelationshipProfile, type RelationshipProfile,
} from '../index'
import { character, relationship } from '../../../engine/src/__tests__/fixtures'

const personality = { jealousy: 50, emotionalExpression: 50 }
const profile = (over: Partial<RelationshipProfile> = {}): RelationshipProfile => ({
  version: 1, sourceHash: 'h', generatedAt: '2026-09-29T00:00:00.000Z', reactions: {}, grows: {}, moods: {}, reachOut: {}, ...over,
})
const ai = <T>(value: T) => ({ value, by: 'ai' as const, quote: '근거' })

describe('관계 성격표 — 같은 일에도 캐릭터마다 다르게', () => {
  it('scales an event by how strongly this character takes it', () => {
    const broke = [{ type: 'broke_promise' as const, confidence: 1 }]
    expect(deltaFromSemanticEvents(broke, personality).trust).toBe(-10)
    expect(deltaFromSemanticEvents(broke, personality, profile({ reactions: { broke_promise: ai('extreme') } })).trust).toBe(-20)
    expect(deltaFromSemanticEvents(broke, personality, profile({ reactions: { broke_promise: ai('none') } })).trust).toBeUndefined()
  })

  it('a character who dislikes flattery cools on a compliment instead of warming, and is not made happy by it', () => {
    const compliment = [{ type: 'compliment' as const, confidence: 1 }]
    const averse = profile({ reactions: { compliment: ai('averse') } })
    const delta = deltaFromSemanticEvents(compliment, personality, averse)
    expect(delta.attraction).toBe(-2)
    expect(delta.emotionalDistance).toBe(1)
    const warm = relationship({ attraction: 40 })
    expect(deriveCharacterState(DEFAULT_CHARACTER_STATE, warm, compliment).mood).toBe('happy')
    const cooled = deriveCharacterState(DEFAULT_CHARACTER_STATE, warm, compliment, averse)
    expect(cooled.mood).not.toBe('happy')
    expect(cooled.stress).toBe(DEFAULT_CHARACTER_STATE.stress - 4 + 6)
  })

  it('a character who does not mind other people is not jealous and does not reach out over it', () => {
    const mention = [{ type: 'mentioned_other_romantic_interest' as const, confidence: .9 }]
    const easy = profile({ reactions: { mentioned_other_romantic_interest: ai('none') } })
    expect(deltaFromSemanticEvents(mention, personality, easy)).toEqual({ jealousy: -2 })
    const r = relationship({ jealousy: 60 })
    expect(deriveCharacterState(DEFAULT_CHARACTER_STATE, relationship(), mention, easy).mood).not.toBe('jealous')
    const context = { relationship: r, characterState: DEFAULT_CHARACTER_STATE, semanticEvents: mention, idleMinutes: 0, turnCount: 3 }
    expect(evaluateEventRules(context).map(rule => rule.id)).toContain('jealousy_spike')
    expect(evaluateEventRules({ ...context, profile: easy }).map(rule => rule.id)).not.toContain('jealousy_spike')
  })

  it('grows what this character grows with time together (not in a tense relationship)', () => {
    const input = { curve: 'steady' as const, events: [], turn: 4, userInput: '오늘 하루도 무사히 끝났네' }
    const guard = profile({ grows: { protectiveness: ai(true as const) } })
    expect(companionshipDelta({ ...input, relationship: relationship() }).protectiveness).toBeUndefined()
    expect(companionshipDelta({ ...input, relationship: relationship(), profile: guard }).protectiveness).toBe(1)
    expect(companionshipDelta({ ...input, relationship: relationship({ stage: 'conflict' }), profile: guard }).protectiveness).toBeUndefined()
  })

  it('opens up at the pace of this character and needs its own turning point to become a friend', () => {
    const close = relationship({ stage: 'acquaintance', trust: 52, attachment: 30 })
    expect(nextRelationshipStage('acquaintance', close, [], 10)).toBe('friend')
    expect(nextRelationshipStage('acquaintance', close, [], 10, profile({ opening: ai('slow') }))).toBe('acquaintance')
    const secret = profile({ turningPoint: ai('shared_secret') })
    expect(nextRelationshipStage('acquaintance', close, [], 10, secret)).toBe('acquaintance')
    expect(nextRelationshipStage('acquaintance', close, [{ type: 'shared_secret', confidence: .7 }], 10, secret)).toBe('friend')
    const stranger = relationship({ trust: 31 })
    expect(nextRelationshipStage('stranger', stranger, [], 2, profile({ opening: ai('fast') }))).toBe('acquaintance')
  })

  it('never turns romantic when the character does not, and forgives at its own threshold', () => {
    const friend = relationship({ stage: 'friend', trust: 70, attraction: 70 })
    const confession = [{ type: 'confession' as const, confidence: .9 }]
    expect(nextRelationshipStage('friend', friend, confession, 20)).toBe('ambiguous')
    expect(nextRelationshipStage('friend', friend, confession, 20, profile({ romance: ai('never') }))).toBe('friend')
    const sorry = [{ type: 'apologized' as const, confidence: .9 }]
    const hurt = relationship({ stage: 'conflict', trust: 45 })
    expect(nextRelationshipStage('conflict', hurt, sorry, 20)).toBe('acquaintance')
    expect(nextRelationshipStage('conflict', hurt, sorry, 20, profile({ forgiveness: ai('slow') }))).toBe('conflict')
  })

  it('shows a mood in the character\'s own way and drops the shared goal for it', () => {
    const own = profile({ moods: { jealous: ai('캐묻지 않는다. 말수가 줄고, 괜찮은 사람이냐고 한 번만 묻는다.') } })
    expect(moodGuide('jealous', own)).toContain('캐묻지 않는다')
    expect(moodGuide('jealous')).toContain('되묻는다')
    const mention = [{ type: 'mentioned_other_romantic_interest' as const, confidence: .9 }]
    expect(deriveCharacterState(DEFAULT_CHARACTER_STATE, relationship(), mention).currentGoals).toHaveLength(1)
    expect(deriveCharacterState(DEFAULT_CHARACTER_STATE, relationship(), mention, own).currentGoals).toEqual([])
  })

  it('reaches out in its own words, or not at all', () => {
    const r = relationship({ jealousy: 60 })
    const context = { relationship: r, characterState: DEFAULT_CHARACTER_STATE, idleMinutes: 0, turnCount: 3,
      semanticEvents: [{ type: 'mentioned_other_romantic_interest' as const, confidence: .9 }] }
    const own = profile({ reachOut: { jealousy_spike: ai({ on: true, reason: '괜찮은 사람인지만 확인하고 싶다' }) } })
    expect(evaluateEventRules({ ...context, profile: own })[0]?.effect.realityIntent?.reason).toBe('괜찮은 사람인지만 확인하고 싶다')
    expect(evaluateEventRules({ ...context, profile: profile({ reachOut: { jealousy_spike: ai({ on: false, reason: '' }) } }) })).toEqual([])
    expect([...REACH_OUT_RULES].sort()).toEqual(EVENT_RULES.map(rule => rule.id).sort())
  })

  it('never locks a relationship: an unwelcome apology or turning point still counts as having happened', () => {
    const sorry = [{ type: 'apologized' as const, confidence: .9 }]
    const grudge = profile({ reactions: { apologized: ai('averse') } })
    expect(nextRelationshipStage('distrust', relationship({ stage: 'distrust', trust: 45 }), sorry, 20, grudge)).toBe('acquaintance')
    const close = relationship({ stage: 'acquaintance', trust: 52, attachment: 30 })
    const indifferent = profile({ turningPoint: ai('asked_about_character'), reactions: { asked_about_character: ai('none') } })
    expect(nextRelationshipStage('acquaintance', close, [{ type: 'asked_about_character', confidence: .5 }], 10, indifferent)).toBe('friend')
  })

  it('keeps the derived table out of what models read as the authored character, and lays the current table over a pinned one', () => {
    const table = profile({ reactions: { compliment: ai('averse') } })
    const withTable = withRelationshipProfile(character(), table)
    expect(withTable.personality.relationshipProfile).toBe(table)
    const authored = authoredCharacter(withTable)
    expect('relationshipProfile' in authored.personality).toBe(false)
    expect(JSON.stringify(authored)).not.toContain('sourceHash')
    expect(authored.personality.personality).toBe(withTable.personality.personality)
  })

  it('does not play a guarded stranger as hurt; a relationship that broke down still is', () => {
    const cold = relationship({ trust: 10, emotionalDistance: 85 })
    expect(deriveCharacterState(DEFAULT_CHARACTER_STATE, cold, []).mood).toBe('neutral')
    expect(deriveCharacterState(DEFAULT_CHARACTER_STATE, { ...cold, stage: 'distrust' }, []).mood).toBe('hurt')
  })
})

describe('관계 성격표 읽기', () => {
  it('keeps valid slots and drops anything outside the choices', () => {
    const parsed = parseRelationshipProfile({
      version: 1, sourceHash: 'h', generatedAt: 'now',
      reactions: { compliment: { value: 'averse', by: 'ai' }, lied: { value: 'averse' }, hostility: { value: 'huge' }, broke_promise: { value: 'high', by: 'author' } },
      grows: { protectiveness: { value: true }, jealousy: { value: true } },
      romance: { value: 'quick' }, forgiveness: { value: 'slow' }, turningPoint: { value: 'lied' },
      moods: { jealous: { value: '가'.repeat(161) }, happy: { value: '티 내지 않고 챙긴다' } },
      reachOut: { cold_silence: { value: { on: false, reason: '' } }, unknown: { value: { on: false, reason: '' } } },
    })!
    expect(Object.keys(parsed.reactions).sort()).toEqual(['broke_promise', 'compliment'])
    expect(parsed.reactions.broke_promise?.by).toBe('author')
    expect(Object.keys(parsed.grows)).toEqual(['protectiveness'])
    expect(parsed.romance).toBeUndefined()
    expect(parsed.turningPoint).toBeUndefined()
    expect(parsed.forgiveness?.value).toBe('slow')
    expect(Object.keys(parsed.moods)).toEqual(['happy'])
    expect(Object.keys(parsed.reachOut)).toEqual(['cold_silence'])
    expect(parseRelationshipProfile({ version: 2, sourceHash: 'h', generatedAt: 'now' })).toBeNull()
    expect(parseRelationshipProfile(null)).toBeNull()
  })

  it('keeps what the author changed when the table is made again', () => {
    const previous = profile({ reactions: { compliment: { value: 'averse', by: 'author' }, lied: ai('high') }, romance: { value: 'never', by: 'author' } })
    const next = profile({ sourceHash: 'h2', reactions: { compliment: ai('high'), broke_promise: ai('extreme') }, romance: ai('slow') })
    const merged = keepAuthorItems(next, previous)
    expect(merged.sourceHash).toBe('h2')
    expect(merged.reactions.compliment).toEqual({ value: 'averse', by: 'author' })
    expect(merged.reactions.broke_promise?.value).toBe('extreme')
    expect(merged.reactions.lied).toBeUndefined()
    expect(merged.romance?.value).toBe('never')
  })
})
