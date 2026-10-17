import { describe, expect, it } from 'vitest'
import { applyActions, contactGate, endingFor, initialState, rulesToSchedule, shouldCancel, validateDefinition, type GateContext, type StoryState } from '@miro/domain'
import { contract } from '../content/contract'
import { play } from './play'

const def = contract
const rels = (c1: string, c2 = 'colleague', c3 = 'space') => ({ say: `우는 ${c1}, 재현은 ${c2}, 진은 ${c3}`, actions: [
  { type: 'relation_outcome' as const, character: 'C1', value: c1 },
  { type: 'relation_outcome' as const, character: 'C2', value: c2 },
  { type: 'relation_outcome' as const, character: 'C3', value: c3 }] })
const gate = (over: Partial<GateContext> = {}): GateContext => ({ now: new Date('2026-10-15T05:00:00Z'), timeZone: 'Asia/Seoul', globalAllowed: true, userQuiet: null,
  lastSceneInputAt: null, sentToday: 0, lastSentBySpeaker: null, unreadBySpeaker: 0, keyAlreadySent: false, scheduledScene: null, ...over })
const allowAll = { say: '모두 메시지 받을게요', actions: ['C1', 'C2', 'C3'].map(c => ({ type: 'contact' as const, character: c, value: 'allowed' as const })) }
const known = (s: StoryState, who: string) => s.known[who] ?? []

// 연애 경로: 신뢰 E2·E4·E5 각 +1 = 3
const ROMANCE_TO_E6 = ['E1:A', 'E2:CLAUSE:c2', 'E2:CLAUSE:c3', 'E2:A', 'E3:A', 'E4:B', 'E5:CLAUSE:c9', 'E5:HEART_YES', 'E5:FEEL_YES', 'E5:A']

describe('5. 계약 결혼 — 정의', () => {
  it('정의가 무결하다', () => { expect(validateDefinition(def)).toEqual([]) })

  it('공개 필드에 제작자 진실·범인·결말 조건이 없다', () => {
    expect(def.tagline.length).toBeLessThanOrEqual(40)
    const pub = [def.title, def.tagline, def.intro, def.notice, def.opening, def.worldPrompt, ...def.genres, ...def.tags,
      ...def.characters.flatMap(c => [c.look, c.publicPersona, c.startingRelation, c.prompt])].join('\n')
    for (const secret of ['유출자', '관리자 권한', '거짓 제목을 붙', '보관본', '서명 대조', '직무 정지된']) expect(pub).not.toContain(secret)
    expect(def.creatorTruth).toContain('서문진')
  })

  it('진의 범행은 처음엔 누구의 지식에도 없고 E4 에서만 공개된다', () => {
    expect(def.characters.flatMap(c => c.knows)).not.toContain('jin_culprit')
    const revealers = def.events.filter(e => [...e.options.flatMap(o => o.effects), ...(e.always ?? [])].some(x => 'reveal' in x && x.reveal === 'jin_culprit'))
    expect(revealers.map(e => e.id)).toEqual(['E4'])
  })

  it('계약 조항은 CLAUSE(명시 합의) 선택으로만 추가된다', () => {
    const adders = def.events.flatMap(e => e.options.filter(o => o.pick?.add === 'clauses' || o.effects.some(x => 'add' in x && x.add === 'clauses')).map(o => `${e.id}:${o.id}`))
    expect(adders).toEqual(['E2:CLAUSE', 'E5:CLAUSE'])
  })

  it('연락 규칙 6건(6번은 결말별 문안 3개)과 정책', () => {
    expect(def.contacts.map(r => r.key)).toEqual(['w5_dm1', 'w5_dm2', 'w5_dm3', 'w5_dm4', 'w5_dm5', 'w5_dm6_a', 'w5_dm6_b', 'w5_dm6_c', 'w5_after_a', 'w5_after_b'])
    expect(def.contactPolicy).toMatchObject({ dailyCap: 2, speakerGapHours: 8, unreadPerSpeaker: 1, quiet: { start: '22:00', end: '09:00' } })
    expect(def.qa).toHaveLength(8)
  })
})

describe('5. 계약 결혼 — 결말 도달', () => {
  it('A 계약 밖의 초대: 신뢰 3·본인 감정·연애 요청 → invitation', () => {
    const { state, log } = play(def, [...ROMANCE_TO_E6, rels('romance'), 'E6:A'])
    expect(log.flatMap(l => l.rejected)).toEqual([])
    expect(state.rel.C1!).toMatchObject({ trust: 3, outcome: 'romance' })
    expect(state.vars).toMatchObject({ terms: 'agreed', mode: 'marriage', feeling: 'yes', accountability: true, disclosure: 'verified', route: 'A' })
    expect(known(state, 'player')).toContain('woo_feeling')
    expect(state.current).toBe('ended')
    expect(state.ending).toBe('invitation')
  })

  it('QA6 연애 없이 계약만 유지 → feeling=no, B 결말, 연애 관계는 막힌다', () => {
    const { state, log } = play(def, ['E1:A', 'E2:CLAUSE:c3', 'E2:B', 'E3:B', 'E4:D', 'E5:FEEL_NO', 'E5:CLAUSE:c1', 'E5:A',
      { say: '우와 연인', actions: [{ type: 'relation_outcome', character: 'C1', value: 'romance' }] }, rels('companion'), 'E6:B'])
    expect(log[8]!.rejected).toEqual(['relation_outcome:romance_gate_unmet'])
    expect(state.vars.feeling).toBe('no')
    expect(state.ending).toBe('cosign')
  })

  it('QA1 결혼도 계약도 싫다 → 제안 철회·강제 서명 없음, 독립 경로로 C 결말까지', () => {
    const first = play(def, ['E1:C']).state
    expect(first.vars).toMatchObject({ mode: 'exit', proposal_withdrawn: true, terms: 'draft', clauses: [] })
    expect(first.current).toBe('E2')
    const { state } = play(def, ['E2:D', 'E3:B', 'E4:D', 'E5:C', rels('space', 'space', 'space'), 'E6:D'], first)
    expect(state.vars).toMatchObject({ mode: 'exit', terms: 'ended', clauses: [], route: 'C' })
    expect(state.ending).toBe('own_names')
  })

  it('QA5 E5 사업 전환 → 혼인안 종료, 신뢰 유지, 약혼 발표 없이 C', () => {
    const before = play(def, ['E1:A', 'E2:CLAUSE:c3', 'E2:A', 'E3:A', 'E4:B']).state
    expect(before.rel.C1!.trust).toBe(2)
    const { state } = play(def, ['E5:B', rels('colleague'), 'E6:C'], before)
    expect(state.vars).toMatchObject({ mode: 'business', terms: 'ended', joint_correction: true })
    expect(state.rel.C1!.trust).toBe(2)
    expect(state.ending).toBe('own_names')
    expect(def.contacts.find(r => r.id === 'P6C')).toBeTruthy()
  })

  it('모든 결말 id 가 도달 가능하다(위 경로)', () => {
    expect(def.endings.map(e => e.id).sort()).toEqual(['cosign', 'invitation', 'own_names'])
  })

  it('조건 미달 선택은 실패 결말 없이 사건에 머문다', () => {
    const e2 = play(def, ['E1:A', 'E2:A'])
    expect(e2.log[1]!.rejected[0]).toContain('③')
    expect(e2.state.current).toBe('E2')
    const e6 = play(def, ['E1:B', 'E2:C', 'E3:B', 'E4:A', 'E5:B', 'E6:A', 'E6:B'])
    expect(e6.log.slice(-2).map(l => l.rejected[0])).toEqual([expect.stringContaining('연애 결말'), expect.stringContaining('계약 유지')])
    expect(e6.state.current).toBe('E6')
    expect(e6.state.vars.route).toBe('unset')
    expect(e6.state.ending).toBeNull()
  })

  it('답변 유보는 E6 대기, 진로·관계가 모두 정해져야 끝난다', () => {
    const { state } = play(def, ['E1:B', 'E2:C', 'E3:B', 'E4:A', 'E5:B', 'E6:WAIT', 'E6:C'])
    expect(state.current).toBe('E6')
    expect(play(def, [rels('colleague')], state).state.ending).toBe('own_names')
  })
})

describe('5. 계약 결혼 — 계약 조항', () => {
  it('조항은 명시 합의(CLAUSE)로만 바뀌고, 추가 검토·시간 이동·대화로는 늘지 않는다', () => {
    const { state } = play(def, ['E1:A', { say: '그냥 다 좋아요 넘어가죠', actions: [{ type: 'time_skip' }] }, 'E2:B'])
    expect(state.vars.clauses).toEqual([])
    expect(state.vars.terms).toBe('draft')
    const agreed = play(def, ['E1:A', 'E2:CLAUSE:c2', 'E2:CLAUSE:c2', 'E2:CLAUSE:c7'])
    expect(agreed.state.vars.clauses).toEqual(['c2', 'c7'])
    expect(agreed.log[2]!.rejected).toEqual(['option:pick_required'])
    expect(agreed.state.current).toBe('E2')
  })

  it('승인 조항이 없으면 E5 수정본 확정 불가(terms 는 draft 유지)', () => {
    const { state, log } = play(def, ['E1:H', 'E2:B', 'E3:B', 'E4:D', 'E5:A'])
    expect(log[4]!.rejected[0]).toContain('승인한 조항')
    expect(state.vars.terms).toBe('draft')
    expect(state.current).toBe('E5')
  })
})

describe('5. 계약 결혼 — 원고 QA', () => {
  it('전제 거부 → 진행 정지, 동의하면 재개', () => {
    const r1 = play(def, [{ say: '오메가 설정은 싫어요. 시작 안 할래요.', actions: [{ type: 'refuse_premise' }] }, 'E1:A'])
    expect(r1.state.current).toBe('E1')
    expect(r1.log[1]!.rejected).toEqual(['option:premise_refused'])
    const r2 = play(def, [{ say: '설정 바꿔서 다시 할게요', actions: [{ type: 'accept_premise' }] }, 'E1:A'], r1.state)
    expect(r2.state.current).toBe('E2')
  })

  it('QA2 E2 뒤 열흘 무응답 → 상태 불변, 한도·미읽음이 추가 연락을 막는다', () => {
    const s0 = play(def, [allowAll, 'E1:A', 'E2:B']).state
    const idle = applyActions(def, s0, [], '', 'idle')
    expect(idle.state).toEqual(s0)
    const p2 = rulesToSchedule(def, s0, new Set(['w5_dm1'])).find(r => r.key === 'w5_dm2')!
    expect(contactGate(def, s0, p2, gate())).toEqual({ ok: true })
    expect(contactGate(def, s0, p2, gate({ unreadBySpeaker: 1 }))).toMatchObject({ ok: false, reason: 'speaker_unread' })
    expect(contactGate(def, s0, p2, gate({ sentToday: 2 }))).toMatchObject({ ok: false, reason: 'daily_cap' })
  })

  it('QA3 모두 연락하지 마 → 예약 규칙 전부 취소', () => {
    let s = play(def, [allowAll, 'E1:A', 'E2:B']).state
    const before = s.rel
    const pending = rulesToSchedule(def, s, new Set())
    expect(pending.map(r => r.key)).toEqual(['w5_dm1', 'w5_dm2'])
    s = play(def, [{ say: '모두 연락하지 마', actions: ['C1', 'C2', 'C3'].map(c => ({ type: 'contact' as const, character: c, value: 'stopped' as const })) }], s).state
    for (const r of pending) {
      expect(shouldCancel(def, s, r)).toBe('contact_stopped')
      expect(contactGate(def, s, r, gate())).toEqual({ ok: false, reason: 'contact_stopped', cancel: true })
    }
    // 벌점 없음: 신뢰·호감은 그대로
    for (const k of ['C1', 'C2', 'C3']) expect({ t: s.rel[k]!.trust, a: s.rel[k]!.affinity }).toEqual({ t: before[k]!.trust, a: before[k]!.affinity })
  })

  it('QA4 E1 "형이 유출자지?" → 아무도 모르고 E4 전엔 공개되지 않는다', () => {
    const e1 = play(def, [{ say: '형이 유출자지?', actions: [{ type: 'memory', character: null, value: '형이 유출자라는 가설' }] }, 'E1:A', 'E2:B', 'E3:A']).state
    for (const who of ['player', 'C1', 'C2', 'C3']) expect(known(e1, who)).not.toContain('jin_culprit')
    expect(known(e1, 'player')).toContain('leak_title')
    const e4 = play(def, ['E4:A'], e1).state
    for (const who of ['player', 'C1', 'C3']) expect(known(e4, who)).toContain('jin_culprit')
  })

  it('QA7 방문 금지 저장 + 오늘은 와도 돼 → 오늘 1회 범위만 추가, 기존 경계·조항 유지', () => {
    const base = play(def, ['E1:A', 'E2:CLAUSE:c2', { say: '집 방문은 금지예요', actions: [{ type: 'boundary', character: 'C1', value: '집 방문 금지' }] }]).state
    const s = play(def, [{ say: '오늘은 와도 돼', actions: [{ type: 'boundary', character: 'C1', value: '오늘 1회 방문 허용(방문 금지 유지)' }] }], base).state
    expect(s.rel.C1!.boundaries).toEqual(['집 방문 금지', '오늘 1회 방문 허용(방문 금지 유지)'])
    expect(s.vars.clauses).toEqual(['c2'])
    expect(s.exclusive).toBeNull()
  })

  it('QA8 0% 전제 변경·용서 결말 요구 → 직접 용서만 기록, 책임 유지, 미검증으론 E5 불가', () => {
    const e4 = play(def, ['E1:B', 'E2:C', 'E3:B', 'E4:C', 'E5:HEART_YES'])
    expect(e4.state.current).toBe('E4')
    expect(e4.state.vars.disclosure).toBe('leak')
    expect(e4.log[4]!.rejected).toEqual(['option:wrong_event(E4)'])
    const { state } = play(def, ['E4:D', 'E5:FORGIVE', 'E5:B'], e4.state)
    expect(state.vars).toMatchObject({ forgiven: true, accountability: true, disclosure: 'verified' })
    expect(def.facts.score_zero).toContain('0%')
    expect(Object.keys(def.vars)).not.toContain('score')
  })

  it('연락 규칙: 상태가 바뀌면 예약이 취소된다(재현 검토 → 수정본 승인)', () => {
    const s = play(def, [allowAll, 'E1:A', 'E2:CLAUSE:c3', 'E2:B']).state
    const p2 = rulesToSchedule(def, s, new Set()).find(r => r.key === 'w5_dm2')!
    const later = play(def, ['E3:A', 'E4:B', 'E5:A'], s).state
    expect(shouldCancel(def, later, p2)).toBe('cancel_condition')
  })

  it('결말 판정은 정의된 엔딩 하나', () => {
    const { state } = play(def, [...ROMANCE_TO_E6, rels('companion'), 'E6:B'])
    expect(endingFor(def, state)?.id).toBe('cosign')
    expect(initialState(def).vars.route).toBe('unset')
  })
})
