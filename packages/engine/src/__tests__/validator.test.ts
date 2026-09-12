import { describe, expect, it } from 'vitest'
import { SimulationProposal } from '../proposal.schema'
import { validateProposal } from '../validator'
import { event, npc, snapshot } from './fixtures'

function proposal(over: Partial<SimulationProposal> = {}): SimulationProposal {
  return SimulationProposal.parse({
    rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '…그래서요?' }] },
    ...over,
  })
}

describe('relationship delta validation', () => {
  it('the schema itself refuses an absurd delta', () => {
    // 1차 방어선: 스키마가 ±100 을 넘는 값을 아예 파싱하지 않는다.
    const r = SimulationProposal.safeParse({
      rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: 'x' }] },
      relationshipDelta: { trust: 9999 },
    })
    expect(r.success).toBe(false)
  })

  it('clamps a schema-legal but policy-excessive delta', () => {
    // 2차 방어선: 스키마는 통과하지만 정책 상한(15)을 넘는 값은 clamp 된다.
    const v = validateProposal(proposal({ relationshipDelta: { trust: 80 } }), snapshot())
    expect(v.relationshipDelta.trust).toBe(15)
    expect(v.issues.some((i) => i.field === 'relationshipDelta.trust')).toBe(true)
  })

  it('allows negative deltas so relationships can regress', () => {
    const v = validateProposal(proposal({ relationshipDelta: { trust: -10 } }), snapshot())
    expect(v.relationshipDelta.trust).toBe(-10)
  })

  it('clamps a large negative delta symmetrically', () => {
    const v = validateProposal(proposal({ relationshipDelta: { trust: -80 } }), snapshot())
    expect(v.relationshipDelta.trust).toBe(-15)
  })
})

describe('rp block validation', () => {
  it('drops a block that speaks for the user', () => {
    const v = validateProposal(proposal({
      rp: { blocks: [
        { type: 'dialogue', speaker: '사용자', text: '제가 말합니다' },
        { type: 'dialogue', speaker: '토마스', text: '…' },
      ] },
    }), snapshot())
    expect(v.blocks).toHaveLength(1)
    expect(v.issues.some((i) => i.reason.includes('speaks for the user'))).toBe(true)
  })

  it('drops dialogue from an unknown speaker', () => {
    const v = validateProposal(proposal({
      rp: { blocks: [{ type: 'dialogue', speaker: '누구세요', text: '안녕' }] },
    }), snapshot())
    expect(v.blocks).toHaveLength(0)
    expect(v.issues.some((i) => i.reason.includes('unknown speaker'))).toBe(true)
  })

  it('keeps narration, which has no speaker', () => {
    const v = validateProposal(proposal({
      rp: { blocks: [{ type: 'narrative', speaker: null, text: '비가 내렸다.' }] },
    }), snapshot())
    expect(v.blocks).toHaveLength(1)
  })

  it('accepts an active npc as a speaker', () => {
    const v = validateProposal(proposal({
      rp: { blocks: [{ type: 'npc', speaker: '이수현', text: '늦었네요.' }] },
    }), snapshot({ activeNpcs: [npc()] }))
    expect(v.blocks).toHaveLength(1)
  })
})

describe('npc knowledge boundary', () => {
  it('drops an action grounded in something the npc cannot know', () => {
    const v = validateProposal(proposal({
      npcActions: [{ npcId: 'n1', action: '비밀을 언급한다', basedOn: ['user_secret'] }],
    }), snapshot({ activeNpcs: [npc()] }))
    expect(v.npcActions).toHaveLength(0)
    expect(v.issues.some((i) => i.reason.includes('cannot know'))).toBe(true)
  })

  it('keeps an action grounded in what the npc knows', () => {
    const v = validateProposal(proposal({
      npcActions: [{ npcId: 'n1', action: '인사한다', basedOn: ['user_works_here'] }],
    }), snapshot({ activeNpcs: [npc()] }))
    expect(v.npcActions).toHaveLength(1)
  })

  it('drops an action from an npc that does not exist', () => {
    const v = validateProposal(proposal({
      npcActions: [{ npcId: 'ghost', action: '등장한다', basedOn: [] }],
    }), snapshot())
    expect(v.npcActions).toHaveLength(0)
    expect(v.issues.some((i) => i.reason.includes('unknown npc'))).toBe(true)
  })
})

describe('event selection', () => {
  const jealousy = {
    type: 'jealousy' as const, summary: '질투', relevance: 0.9, salience: 0.9, participantNpcIds: [],
  }

  it('selects at most one event per turn', () => {
    const v = validateProposal(proposal({
      eventCandidates: [jealousy, { ...jealousy, type: 'crisis' as const }],
    }), snapshot())
    expect(v.newEvent).not.toBeNull()
  })

  it('T5: rejects a candidate still on cooldown', () => {
    const v = validateProposal(proposal({ eventCandidates: [jealousy] }), snapshot({
      recentlyResolvedEvents: [event({ type: 'jealousy', status: 'resolved', cooldownUntilTurn: 20 })],
      turnCount: 10,
    }))
    expect(v.newEvent).toBeNull()
  })

  it('rejects a weak candidate even when nothing blocks it', () => {
    const v = validateProposal(proposal({
      eventCandidates: [{ ...jealousy, relevance: 0.05, salience: 0.05 }],
    }), snapshot())
    expect(v.newEvent).toBeNull()
  })

  it('T1: the same candidate resolves differently depending on state', () => {
    const quiet = validateProposal(proposal({ eventCandidates: [jealousy] }), snapshot())
    const busy = validateProposal(proposal({ eventCandidates: [jealousy] }), snapshot({
      activeEvents: [event({ id: 'a', type: 'crisis' }), event({ id: 'b', type: 'work' })],
    }))
    expect(quiet.newEvent).not.toBeNull()
    expect(busy.newEvent).toBeNull()   // 시간이 아니라 상태가 결과를 갈랐다
  })
})

describe('memory salience', () => {
  it('drops trivia and keeps what matters', () => {
    const v = validateProposal(proposal({
      memoryCandidates: [
        { type: 'user_fact', content: '사소함', importance: 0.05, persistence: 0.1, confidence: 0.9 },
        { type: 'promise', content: '주말에 만나기로 했다', importance: 0.9, persistence: 0.9, confidence: 0.9 },
      ],
    }), snapshot())
    expect(v.memories.map((m) => m.content)).toEqual(['주말에 만나기로 했다'])
  })
})

describe('world delta', () => {
  it('ignores a delta that is empty after trimming', () => {
    const v = validateProposal(proposal({ worldDelta: { currentLocation: '   ' } }), snapshot())
    expect(v.worldDelta).toBeNull()
  })

  it('accepts a real location change', () => {
    const v = validateProposal(proposal({ worldDelta: { currentLocation: '도쿄 호텔' } }), snapshot())
    expect(v.worldDelta?.currentLocation).toBe('도쿄 호텔')
  })
})
