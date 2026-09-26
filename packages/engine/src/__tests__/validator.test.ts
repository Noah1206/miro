import { describe, expect, it } from 'vitest'
import { MemoryCandidateProposal, SimulationProposal } from '../proposal.schema'
import { validateProposal } from '../validator'
import { renderBlocks } from '../orchestrator'
import { event, npc, snapshot } from './fixtures'

function proposal(over: Partial<SimulationProposal> = {}): SimulationProposal {
  return SimulationProposal.parse({
    rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '…그래서요?' }] },
    ...over,
  })
}

describe('inner voice blocks', () => {
  it("keeps the character's own thought, drops anyone else's or one said on a call, and never puts it in the message text", () => {
    const v = validateProposal(proposal({ rp: { blocks: [
      { type: 'action', speaker: null, text: '책장을 넘긴다.' },
      { type: 'thought', speaker: '토마스', text: '오늘은 좀 반갑네.' },
      { type: 'thought', speaker: '이수현', text: '남의 속마음.' },
      { type: 'dialogue', speaker: '토마스', text: '왔어요?' },
    ] } }), snapshot({ activeNpcs: [npc()] }))
    expect(v.blocks.map(b => b.text)).toEqual(['책장을 넘긴다.', '오늘은 좀 반갑네.', '왔어요?'])
    expect(renderBlocks(v.blocks)).toBe('책장을 넘긴다.\n토마스: 왔어요?')
    const call = validateProposal(proposal({ rp: { blocks: [{ type: 'thought', speaker: '토마스', text: '떨린다.' }, { type: 'dialogue', speaker: '토마스', text: '여보세요.' }] } }), snapshot({ mode: 'voice_call' }))
    expect(call.blocks.map(b => b.type)).toEqual(['dialogue'])
  })
})

describe('relationship delta validation', () => {
  it('the schema drops an absurd delta without losing the reply', () => {
    // 1차 방어선: ±100 을 넘는 값은 적용되지 않는다. 대사는 그대로 살아남는다 —
    // 어차피 엔진이 규칙 delta 로 덮어쓰므로, 이 필드 때문에 턴을 버릴 이유가 없다.
    const r = SimulationProposal.parse({
      rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: 'x' }] },
      relationshipDelta: { trust: 9999 },
    })
    expect(r.relationshipDelta).toBeNull()
    expect(r.rp.blocks).toHaveLength(1)
  })

  /**
   * 실측: 유료 등급에서도 6턴 중 2턴이 invalid_schema 였다. 원문은 남지 않지만 출력이 짧았으므로
   * 잘림이 아니라 모양의 문제다 — 모델은 화자를 생략하고, 감정을 목록 밖 단어로 쓰고, 항목 하나를 어긋나게 준다.
   * 그 어느 것도 대사를 버릴 이유가 아니다.
   */
  it('survives a sloppy but usable model reply', () => {
    const r = SimulationProposal.parse({
      rp: { blocks: [
        { type: 'narrative', text: '창밖으로 비가 내린다' },                 // speaker 생략
        { type: 'dialogue', speaker: '토마스', text: '…그래서요?' },
        { type: 'dialogue', speaker: '토마스', text: '' },                 // 빈 텍스트 — 이 블록만 버린다
      ] },
      emotion: 'calm',                                                   // 목록에 없는 값
      intent: 'x'.repeat(200),                                           // 상한 초과
      relationshipDelta: { trust: 2.5 },                                 // 정수가 아님
      memoryCandidates: [
        { type: 'user_fact', content: '비를 좋아한다', importance: 5, persistence: .5, confidence: .9 },   // importance 범위 밖
        { type: 'user_fact', content: '창가 자리를 좋아한다', importance: .7, persistence: .7, confidence: .9 },
      ],
      realityIntent: { channel: 'telepathy', reason: 'x', urgency: .5 }, // 없는 채널
    })
    expect(r.rp.blocks.map((b) => b.type)).toEqual(['narrative', 'dialogue'])
    expect(r.rp.blocks[0]!.speaker).toBeNull()
    expect(r.emotion).toBeUndefined()
    expect(r.intent).toBeUndefined()
    expect(r.relationshipDelta).toBeNull()
    expect(r.memoryCandidates.map((m) => m.content)).toEqual(['창가 자리를 좋아한다'])
    expect(r.realityIntent).toBeNull()
  })

  it('still fails when no usable block remains', () => {
    // 대사가 하나도 없으면 답이 없는 것이다 — 이건 살릴 수 없다.
    expect(SimulationProposal.safeParse({ rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '' }] } }).success).toBe(false)
    expect(SimulationProposal.safeParse({ rp: { blocks: [] } }).success).toBe(false)
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
  it('accepts blocks written with the type as the key (measured model quirk)', () => {
    // 9/26 실측 원문 그대로의 모양: 종류 이름이 키, 화자가 값.
    const p = SimulationProposal.parse({ rp: { blocks: [
      { action: '토마스', text: '칼을 내려놓으려다 멈춘다.' }, { dialogue: '토마스', text: '…고맙다는 말은 왜 하시는 겁니까.' },
      { thought: '토마스', text: '제멋대로다.' }, { narrative: null, text: '빗소리가 공방을 두드린다.' },
    ] } })
    expect(p.rp.blocks.map((b) => [b.type, b.speaker])).toEqual([['action', '토마스'], ['dialogue', '토마스'], ['thought', '토마스'], ['narrative', null]])
    // 종류 키가 둘 이상이면 추측하지 않는다.
    expect(SimulationProposal.safeParse({ rp: { blocks: [{ action: '토마스', dialogue: '토마스', text: 'x' }] } }).success).toBe(false)
  })

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
        { type: 'user_fact', content: '사소함', importance: 0.05, persistence: 0.1, confidence: 0.9, tags: [] },
        { type: 'promise', content: '주말에 만나기로 했다', importance: 0.9, persistence: 0.9, confidence: 0.9, tags: [] },
      ],
    }), snapshot())
    expect(v.memories.map((m) => m.content)).toEqual(['주말에 만나기로 했다'])
  })

  /** 태그 하나가 어긋났다고 턴 전체를 버리지 않는다 — 모델은 배열 대신 문자열을 자주 준다. */
  it('accepts tags given as a string and never fails the turn on a bad tag', () => {
    const parsed = MemoryCandidateProposal.parse({
      type: 'user_fact', content: '성수동으로 이사했다', importance: .8, persistence: .8, confidence: .9,
      tags: '성수동, 이사',
    })
    expect(parsed.tags).toEqual(['성수동', '이사'])
    expect(MemoryCandidateProposal.parse({ type: 'user_fact', content: '고양이를 키운다', importance: .8, persistence: .8, confidence: .9, tags: 42 }).tags).toEqual([])
    expect(MemoryCandidateProposal.parse({ type: 'user_fact', content: '커피를 좋아한다', importance: .8, persistence: .8, confidence: .9 }).tags).toEqual([])
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

describe('event updates', () => {
  it('lets an active event be resolved', () => {
    const v = validateProposal(proposal({
      eventUpdates: [{ eventId: 'e1', status: 'resolved', consequence: '화해했다' }],
    }), snapshot({ activeEvents: [event({ id: 'e1' })] }))
    expect(v.eventUpdates).toHaveLength(1)
    expect(v.eventUpdates[0]!.status).toBe('resolved')
  })

  it('refuses to update an event that is not active', () => {
    const v = validateProposal(proposal({
      eventUpdates: [{ eventId: 'ghost', status: 'resolved' }],
    }), snapshot({ activeEvents: [event({ id: 'e1' })] }))
    expect(v.eventUpdates).toHaveLength(0)
    expect(v.issues.some((i) => i.reason.includes('not an active event'))).toBe(true)
  })

  it('cannot revive an already resolved event', () => {
    const v = validateProposal(proposal({
      eventUpdates: [{ eventId: 'old', status: 'active' }],
    }), snapshot({
      activeEvents: [],
      recentlyResolvedEvents: [event({ id: 'old', status: 'resolved' })],
    }))
    expect(v.eventUpdates).toHaveLength(0)
  })

  it('ignores a duplicate update for the same event', () => {
    const v = validateProposal(proposal({
      eventUpdates: [
        { eventId: 'e1', status: 'escalated' },
        { eventId: 'e1', status: 'resolved' },
      ],
    }), snapshot({ activeEvents: [event({ id: 'e1' })] }))
    expect(v.eventUpdates).toHaveLength(1)
    expect(v.eventUpdates[0]!.status).toBe('escalated')
  })
})

describe('npc introductions', () => {
  const intro = {
    name: '박서준', role: '경쟁자', knows: ['user_visits_often'],
    relationshipToCharacter: 'rival', relationshipToUser: 'stranger',
  }

  it('accepts a new npc', () => {
    const v = validateProposal(proposal({ npcIntroductions: [intro] }), snapshot())
    expect(v.npcIntroductions).toHaveLength(1)
  })

  it('refuses a name that already exists in the scene', () => {
    const v = validateProposal(
      proposal({ npcIntroductions: [{ ...intro, name: '이수현' }] }),
      snapshot({ activeNpcs: [npc()] }),
    )
    expect(v.npcIntroductions).toHaveLength(0)
  })

  it('refuses an npc impersonating the main character', () => {
    const v = validateProposal(
      proposal({ npcIntroductions: [{ ...intro, name: '토마스' }] }),
      snapshot(),
    )
    expect(v.npcIntroductions).toHaveLength(0)
  })

  it('caps the active cast so npcs cannot crowd out the character', () => {
    const crowd = Array.from({ length: 4 }, (_, i) => npc({ id: `n${i}`, name: `NPC${i}` }))
    const v = validateProposal(
      proposal({ npcIntroductions: [intro] }),
      snapshot({ activeNpcs: crowd }),
    )
    expect(v.npcIntroductions).toHaveLength(0)
    expect(v.issues.some((i) => i.reason.includes('max active npcs'))).toBe(true)
  })
})

describe('call mode', () => {
  it('drops narration during a voice call — there is nothing to narrate on a phone', () => {
    const v = validateProposal(proposal({
      rp: { blocks: [
        { type: 'narrative', speaker: null, text: '비가 내렸다.' },
        { type: 'action', speaker: null, text: '그가 한숨을 쉰다.' },
        { type: 'dialogue', speaker: '토마스', text: '듣고 있어요.' },
      ] },
    }), snapshot({ mode: 'voice_call' }))
    expect(v.blocks.map((b) => b.type)).toEqual(['dialogue'])
  })
  it('keeps a brief action on video', () => {
    const v = validateProposal(proposal({
      rp: { blocks: [
        { type: 'action', speaker: null, text: '시선을 피한다.' },
        { type: 'dialogue', speaker: '토마스', text: '…' },
      ] },
    }), snapshot({ mode: 'video_call' }))
    expect(v.blocks).toHaveLength(2)
  })
})

describe('memory extraction result', () => {
  /** 실측 원문: 새 사실이 없을 때 모델은 previousMemories 를 id 째 되돌려준다. 점수가 없다. */
  it('drops echoed previous memories instead of failing the whole extraction', async () => {
    const { MemoryResult } = await import('../task-router')
    const echoed = MemoryResult.parse({ memories: [
      { id: '7540ae39-a68d-4e0a-92fe-328294384910', type: 'user_fact', content: '사용자는 성수동으로 이사함', tags: ['성수동', '이사'] },
      { id: '3a3ecc66-f2bf-41df-84f5-6294954bb7a2', type: 'user_fact', content: '사용자의 생일은 10월 3일이다.', tags: ['생일'] },
    ] })
    expect(echoed.memories).toEqual([])
    const mixed = MemoryResult.parse({ memories: [
      { id: '7540ae39-a68d-4e0a-92fe-328294384910', type: 'user_fact', content: '사용자는 성수동으로 이사함', tags: ['성수동'] },
      { type: 'user_fact', content: '고양이 루나를 키운다', importance: .8, persistence: .9, confidence: 1, tags: ['루나', '고양이'] },
    ] })
    expect(mixed.memories.map((m) => m.content)).toEqual(['고양이 루나를 키운다'])
  })

  /** 실측 원문: 요약 요청에 모델이 타입 이름을 키로 쓴다. 내용은 살리고 모양만 바로잡는다. */
  it('accepts a summary given as {"short_term_summary": "…"}', async () => {
    const { MemoryResult } = await import('../task-router')
    const r = MemoryResult.parse({ memories: [{ short_term_summary: '사용자는 성수동으로 이사했으며 고양이 루나와 산다.' }] })
    expect(r.memories).toHaveLength(1)
    expect(r.memories[0]).toMatchObject({ type: 'short_term_summary', content: '사용자는 성수동으로 이사했으며 고양이 루나와 산다.' })
    // 정상 모양은 손대지 않는다.
    const ok = MemoryResult.parse({ memories: [{ type: 'user_fact', content: '커피를 좋아한다', importance: .5, persistence: .5, confidence: .5 }] })
    expect(ok.memories[0]!.importance).toBe(.5)
  })

  /** 실측 원문: content 만 있고 type 이 없다. 요약 요청이면 요약이다. 추출 요청이면 무엇인지 몰라 버린다. */
  it('fills a missing type only when the task says what it must be', async () => {
    const { memoryResult, MemoryResult } = await import('../task-router')
    const summary = memoryResult('short_term_summary').parse({ memories: [{ content: '사용자는 성수동으로 이사했다.' }] })
    expect(summary.memories).toHaveLength(1)
    expect(summary.memories[0]!.type).toBe('short_term_summary')
    expect(MemoryResult.parse({ memories: [{ content: '사용자는 성수동으로 이사했다.' }] }).memories).toEqual([])
    // id 가 붙은 복사본은 여전히 떨어진다.
    expect(memoryResult('short_term_summary').parse({ memories: [{ id: 'x', type: 'user_fact', content: '옛 기억' }] }).memories).toEqual([])
  })

  /** 실측: 요약이 300자를 넘겨 통째로 떨어졌다. 문장 경계에서 잘라 살린다. */
  it('clips an over-long summary at a sentence boundary instead of dropping it', async () => {
    const { memoryResult } = await import('../task-router')
    const long = Array.from({ length: 20 }, (_, i) => `사용자는 ${i}번째 사실을 말했다.`).join(' ')
    expect(long.length).toBeGreaterThan(300)
    const r = memoryResult('short_term_summary').parse({ memories: [{ type: 'short_term_summary', content: long }] })
    expect(r.memories).toHaveLength(1)
    expect(r.memories[0]!.content.length).toBeLessThanOrEqual(300)
    expect(r.memories[0]!.content.endsWith('.')).toBe(true)
  })
})
