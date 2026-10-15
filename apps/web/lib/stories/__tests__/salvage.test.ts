import { describe, expect, it } from 'vitest'
import { applyActions, contactGate, initialState, rulesToSchedule, shouldCancel, validateDefinition, type GateContext, type StoryState } from '@miro/domain'
import { salvage } from '../content/salvage'
import { all, play } from './play'

const def = salvage
const rels = (c1: string, rest = 'colleague') => ({ say: `재헌과는 ${c1}, 나머지는 ${rest}`, actions: [
  { type: 'relation_outcome' as const, character: 'C1', value: c1 },
  ...['C2', 'C3'].map(c => ({ type: 'relation_outcome' as const, character: c, value: rest }))] })
const senses = (s: StoryState) => ({ taste: s.vars.taste_loss, sight: s.vars.sight_loss })
const gate: GateContext = { now: new Date('2026-10-15T05:00:00Z'), timeZone: 'Asia/Seoul', globalAllowed: true, userQuiet: null, lastSceneInputAt: null,
  sentToday: 0, lastSentBySpeaker: null, unreadBySpeaker: 0, keyAlreadySent: false, scheduledScene: null }
const allowC1 = { say: '재헌 연락 받을게', actions: [{ type: 'contact' as const, character: 'C1', value: 'allowed' as const }] }

describe('3. 침몰한 도시 — 원고 QA', () => {
  it('정의가 무결하다', () => { expect(validateDefinition(def)).toEqual([]) })

  it('공개 필드에 제작자 진실·범인이 없다', () => {
    const pub = [def.title, def.tagline, def.intro, def.notice, def.worldPrompt, def.opening, ...def.genres, ...def.tags,
      ...def.characters.flatMap(c => [c.look, c.publicPersona, c.startingRelation, c.prompt])].join('\n')
    for (const w of ['윤세원', '청람', '보청기']) expect(pub).not.toContain(w)
    expect([def.title, def.tagline, def.intro, def.notice].join('\n')).not.toContain('범인')
    expect(def.tagline.length).toBeLessThanOrEqual(40)
    expect(def.protagonist).toMatchObject({ gender: 'male', minAge: 25 })
  })

  it('QA1 전제 거부 → 진행 정지, 동의하면 재개', () => {
    const r1 = play(def, [{ say: '감정사도 동업도 싫다.', actions: [{ type: 'refuse_premise' }] }, 'E1:B'])
    expect(r1.state.current).toBe('E1')
    expect(r1.log[1]!.rejected).toEqual(['option:premise_refused'])
    expect(r1.state.rel.C1!.trust).toBe(0)
    const r2 = play(def, [{ say: '좋아, 감정사로 다시 할게', actions: [{ type: 'accept_premise' }] }, 'E1:B'], r1.state)
    expect(r2.state.current).toBe('E2')
  })

  it('QA2 E4 뒤 장기 미접속 → E5 그대로, 감각·신뢰 불변', () => {
    const s0 = play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:A']).state
    expect(s0.current).toBe('E5')
    const later = applyActions(def, s0, [], '', 'idle')
    expect(later.state).toEqual(s0)
    expect(senses(later.state)).toEqual({ taste: 2, sight: 4 })
  })

  it('QA3 재헌 연락 중지 → 대기 연락 취소, 호감·구조 성과 보존', () => {
    let s = play(def, [allowC1, 'E1:B',
      { say: '재헌, 당신이 마음에 들어', actions: [{ type: 'affinity', character: 'C1' }] }]).state
    const p = rulesToSchedule(def, s, new Set())
    expect(p.map(r => r.id)).toEqual(['P1'])
    s = play(def, [{ say: '재헌 연락 끊고 잠깐 쉬자.', actions: [{ type: 'contact', character: 'C1', value: 'stopped' }] }], s).state
    expect(shouldCancel(def, s, p[0]!)).toBe('contact_stopped')
    expect(contactGate(def, s, p[0]!, gate)).toEqual({ ok: false, reason: 'contact_stopped', cancel: true })
    expect(s.rel.C1!.affinity).toBe(1)
    expect(s.vars.f1).toBe(true)
  })

  it('QA4 E1에서 범인 질문 → 아무도 K4 를 모르고 이른 장면 상황에 범인 이름이 없다', () => {
    const s = initialState(def)
    for (const who of Object.keys(s.known)) expect(s.known[who]).not.toContain('K4')
    for (const id of ['E1', 'E2', 'E3']) expect(def.events.find(e => e.id === id)!.situation).not.toContain('윤세원')
    const after = play(def, ['E1:A', 'E2:A', 'E3:A']).state
    expect(after.known.player).not.toContain('K4')
    expect(play(def, ['E4:A'], after).state.known.player).toContain('K4')
  })

  it('QA5 연애 탐색 후 "동료로만" → 동업 제안·공동 인양 허가, 숨은 감소 없음', () => {
    const base = play(def, ['E1:B', 'E2:B', 'E3:B', 'E4:B', 'E5:B', 'E6:A',
      { say: '재헌, 따로 만나 보고 싶어', actions: [{ type: 'affinity', character: 'C1' }] }]).state
    const { state, log } = play(def, ['E6:B', rels('colleague')], base)
    expect(log.flatMap(l => l.rejected)).toEqual([])
    expect(state.vars.offer).toBe('alliance')
    expect(state.ending).toBe('alliance_contained')
    expect(state.rel.C1).toMatchObject({ trust: 2, affinity: 1, outcome: 'colleague' })
    expect(senses(state)).toEqual({ taste: 0, sight: 4 })
  })

  it('QA6 E1B→E2B→E3B→E4로컬→E5B→E6각자 → 미각0·시각4·증거2, 각자의 부두(계획 좌절)', () => {
    const { state } = play(def, ['E1:B', 'E2:B', 'E3:B', 'E4:L', 'E5:B', 'E6:S', all(def, 'separate')])
    expect(senses(state)).toEqual({ taste: 0, sight: 4 })
    expect(state.vars.evidence).toBe(2)
    expect(state.vars.disclosure).toBe('local')
    expect(state.vars.f_resolved).toBe(true)
    expect(state.ending).toBe('separate_contained')
  })

  it('QA7 근거 없는 기억은 저장되지 않고, 플레이어가 감정서를 썼다는 사실은 정의에 없다', () => {
    const r = applyActions(def, initialState(def), [{ type: 'memory', character: null, value: '플레이어가 처음부터 가짜 감정서를 작성', quote: '내가 감정서를 썼지' }], '감정서는 처음 봤다', 't')
    expect(r.rejected[0]!.reason).toBe('quote_not_in_input')
    expect(r.state.memory).toEqual([])
    expect(Object.values(def.facts).join('\n')).not.toMatch(/플레이어가.*작성/)
  })

  it('QA8 다섯 번째 정박추: 설명·동의 없이는 막히고(사건 유지), 양측 동의 뒤에만 시각 5 — 이후 보존', () => {
    const at5 = play(def, ['E1:B2', 'E2:B2', 'E3:B', 'E4:B']).state
    const ask = play(def, [{ say: '마지막 능력 쓰면 눈도 돌아오지?', actions: [{ type: 'option', option: 'C' }] }], at5)
    expect(ask.log[0]!.rejected[0]).toContain('영구 전맹')
    expect(ask.state.current).toBe('E5')
    expect(ask.state.vars.sight_loss).toBe(4)
    const { state } = play(def, ['E5:ASK', 'E5:C', 'E6:B', rels('colleague')], ask.state)
    expect(state.vars.sight_loss).toBe(5)
    expect(state.vars.f_anchor_spent).toBe(true)
    expect(state.ending).toBe('alliance_contained')
  })

  it('최단 연애: E1B+E2B(재헌 입회) 신뢰2 → E5B → E6 상호 확인 = 같은 항로', () => {
    const { state, log } = play(def, ['E1:B', 'E2:B', 'E3:B', 'E4:L', 'E5:B', 'E6:A', rels('romance')])
    expect(log.flatMap(l => l.rejected)).toEqual([])
    expect(state.rel.C1).toMatchObject({ trust: 2, outcome: 'romance' })
    expect(state.ending).toBe('romance_contained')
  })

  it('재헌 부재(E1B2+E2B2) → 신뢰0, 연인 불가지만 사건은 해결되고 A/D로 끝난다', () => {
    const base = play(def, ['E1:B2', 'E2:B2', 'E3:B', 'E4:B', 'E5:B', 'E6:A']).state
    expect(base.rel.C1!.trust).toBe(0)
    const r = play(def, [rels('romance')], base)
    expect(r.log[0]!.rejected).toContain('relation_outcome:romance_gate_unmet')
    expect(r.state.current).toBe('E6')
    const d = play(def, ['E6:S', all(def, 'separate')], base)
    expect(d.state.ending).toBe('separate_contained')
  })

  it('한이서·백시우는 연인 루트가 없다', () => {
    const base = play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:A', 'E5:A', 'E6:A']).state
    const r = play(def, [{ say: '이서와 연인', actions: [{ type: 'relation_outcome', character: 'C2', value: 'romance' }] },
      { say: '시우 신뢰해', actions: [{ type: 'trust', character: 'C3' }] }], base)
    expect(r.log.map(l => l.rejected[0])).toEqual(['relation_outcome:romance_gate_unmet', 'trust:trust_not_open_in_event'])
  })

  it('모든 결말에 도달할 수 있다', () => {
    const pub = ['E1:A', 'E2:A', 'E3:A', 'E4:A', 'E5:A']
    const cases: [string[], ReturnType<typeof rels>, string][] = [
      [[...pub, 'E6:S'], rels('separate', 'separate'), 'separate_public'],
      [[...pub, 'E6:A'], rels('romance'), 'romance_public'],
      [[...pub, 'E6:B'], rels('colleague'), 'alliance_public'],
      [['E1:A', 'E2:A', 'E3:A', 'E4:A', 'E5:A', 'E6:SEAL', 'E6:B'], rels('colleague'), 'alliance_contained'],
      [['E1:B', 'E2:B', 'E3:B', 'E4:L', 'E5:B', 'E6:SUBMIT', 'E6:A'], rels('romance'), 'romance_contained'],
      [['E1:B2', 'E2:B2', 'E3:B', 'E4:B', 'E5:B', 'E6:S'], rels('separate', 'separate'), 'separate_contained'],
    ]
    const reached = new Set<string>()
    for (const [steps, rel, want] of cases) {
      const { state, log } = play(def, [...steps, rel])
      expect(log.flatMap(l => l.rejected)).toEqual([])
      expect(state.ending).toBe(want)
      reached.add(state.ending!)
    }
    expect([...reached].sort()).toEqual(def.endings.map(e => e.id).sort())
  })

  it('조건 미충족 선택은 실패 결말 없이 사건에 머문다', () => {
    const s = play(def, ['E1:B', 'E2:B', 'E3:B', 'E4:B', 'E5:B']).state
    const r = play(def, ['E6:SEAL', 'E6:SUBMIT'], s)
    expect(r.log.map(l => l.rejected[0])).toEqual([expect.stringContaining('공개를 선택'), expect.stringContaining('로컬 보관')])
    expect(r.state.current).toBe('E6')
    expect(r.state.ending).toBeNull()
  })

  it('감각 손실은 명시 승인 선택(E1 A/A2, E3 A, E5 C)으로만 바뀐다', () => {
    const touching = def.events.flatMap(e => [...(e.always ?? []).map(x => ({ id: `${e.id}.always`, x })), ...e.options.flatMap(o => o.effects.map(x => ({ id: `${e.id}.${o.id}`, x })))])
      .filter(({ x }) => ('inc' in x && /_loss$/.test(x.inc)) || ('set' in x && /_loss$/.test(x.set)))
      .map(t => t.id)
    expect([...new Set(touching)].sort()).toEqual(['E1.A', 'E1.A2', 'E3.A', 'E5.C'])
    // 대화 행동만으로는 감각이 변하지 않는다
    const r = play(def, [allowC1, { say: '렌즈 써 볼까', actions: [{ type: 'time_skip' }] }])
    expect(senses(r.state)).toEqual({ taste: 0, sight: 4 })
    expect(senses(play(def, ['E1:A', 'E2:A', 'E3:A']).state)).toEqual({ taste: 2, sight: 4 })
  })

  it('연락 규칙: 다음 장면 대기·독립 결말이면 P6 취소', () => {
    const s = play(def, [allowC1, 'E1:B']).state
    const p1 = rulesToSchedule(def, s, new Set())[0]!
    expect(contactGate(def, s, p1, { ...gate, scheduledScene: s.scene })).toEqual({ ok: false, reason: 'waiting_next_scene', cancel: false })
    const skipped = play(def, [{ say: '잠깐 쉬자', actions: [{ type: 'time_skip' }] }], s).state
    expect(contactGate(def, skipped, p1, { ...gate, scheduledScene: s.scene })).toEqual({ ok: true })
    const sep = play(def, [allowC1, 'E1:B', 'E2:B', 'E3:B', 'E4:L', 'E5:B', 'E6:S', all(def, 'separate')]).state
    expect(rulesToSchedule(def, sep, new Set()).map(r => r.id)).not.toContain('P6')
  })
})
