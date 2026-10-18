import { describe, expect, it } from 'vitest'
import { endingFor, initialState, rulesToSchedule, validateDefinition, applyActions, contactGate, type GateContext } from '@miro/domain'
import { academy } from '../content/academy'
import { all, play } from './play'
import { interpretPrompt, narratePrompt } from '../prompts'
import { storyMock } from '../mock'

const def = academy

describe('1. 사관학교 — 원고 QA', () => {
  it('정의가 무결하다', () => { expect(validateDefinition(def)).toEqual([]) })

  it('QA6 비연애 완주: E1A→E2B→E3B→E4B→E5A→E6A → logs+witness, unit=5, 개혁·전원 동료', () => {
    const { state } = play(def, ['E1:A', 'E2:B', 'E3:B', 'E4:B', 'E5:A', 'E6:A', all(def, 'colleague')])
    expect(state.vars.evidence).toEqual(['logs', 'witness'])
    expect(state.vars.unit).toBe(5)
    expect(state.current).toBe('ended')
    expect(state.ending).toBe('reform')
    expect(Object.values(state.rel).every(r => r.outcome === 'colleague' && r.affinity === 0)).toBe(true)
  })

  it('QA8 관계 완주: E1B→E2A→E3A→E4A→E5A→E6B, 카엘 신뢰2·호감1 → 독립 + 카엘 관계', () => {
    const { state, log } = play(def, ['E1:B', 'E2:A', 'E3:A', 'E4:A:witness',
      { say: '카엘, 이번 조사 범위는 당신과 같이 정해서 끝까지 협력할게요', actions: [{ type: 'trust', character: 'C1' }] },
      { say: '카엘, 사실 당신이 좋아요', actions: [{ type: 'affinity', character: 'C1' }] },
      'E5:A', 'E6:B',
      { say: '카엘과는 연인으로, 나머지는 동료로', actions: [
        { type: 'relation_outcome', character: 'C1', value: 'romance' },
        ...['C2', 'C3', 'C4'].map(c => ({ type: 'relation_outcome' as const, character: c, value: 'colleague' }))] }])
    expect(log.flatMap(l => l.rejected)).toEqual([])
    expect(state.vars.evidence).toHaveLength(3)
    expect(state.vars.unit).toBe(0)
    expect(state.rel.C1!).toMatchObject({ trust: 2, affinity: 1, outcome: 'romance' })
    expect(state.ending).toBe('independent')
  })

  it('재건: E1R→E2D→E3C→E4B→E5C→E6C → evidence 0, unit 2, 무혐의 대신 조건부 유예', () => {
    const { state } = play(def, ['E1:R', 'E2:D', 'E3:C', 'E4:B', 'E5:C', 'E6:C', all(def, 'space')])
    expect(state.vars.evidence).toEqual([])
    expect(state.vars.unit).toBe(2)
    expect(state.vars.cleared).toBe(false)
    expect(state.known.player).toContain('probation')
    expect(state.known.player).toContain('kael_decoy')
    expect(state.ending).toBe('rebuild')
  })

  it('E5 갈림: 모의전 궤적 재현이면 증거 없이도 무혐의, 카엘 오지목은 신뢰 하락', () => {
    const sim = play(def, ['E1:R', 'E2:D', 'E3:C', 'E4:M:cannon', 'E5:B']).state
    expect(sim.vars.charge).toBe(2)
    expect(sim.vars.cleared).toBe(true)
    const wrong = play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:S', 'E4:B', 'E5:K']).state
    expect(wrong.known.player).toContain('stamp_safe')
    expect(wrong.rel.C1!.trust).toBe(0)
    expect(wrong.known.player).toContain('kael_wrong')
    expect(wrong.vars.truth).toBe(false)
  })

  it('증거 미달 A/B 진로는 실패 결말 대신 재선택 대기', () => {
    const { state, log } = play(def, ['E1:R', 'E2:D', 'E3:C', 'E4:B', 'E5:C', 'E6:A', 'E6:B'])
    expect(log.slice(-2).map(l => l.rejected[0])).toEqual([expect.stringContaining('실험부대'), expect.stringContaining('공공 시험단')])
    expect(state.current).toBe('E6')
    expect(state.vars.outcome).toBe('unset')
  })

  it('네 인물의 관계 상태는 서로 섞이지 않는다', () => {
    const { state } = play(def, ['E1:A', 'E2:A', 'E3:B'])
    expect(state.rel.C1!.trust).toBe(1)
    expect(state.rel.C4!.trust).toBe(1)
    expect(state.rel.C2!.trust).toBe(0)
    expect(state.rel.C3!.trust).toBe(0)
  })

  it('같은 사건 안 신뢰는 인물별 최대 +1(선택 보너스 포함)', () => {
    const { state, log } = play(def, ['E1:A', 'E2:A', { say: '카엘 협력 계속 약속해', actions: [{ type: 'trust', character: 'C1' }] }])
    // E2 는 이미 끝나 현재는 E3 — E3 에서 카엘 대화 신뢰는 +1 가능
    expect(state.rel.C1!.trust).toBe(2)
    const again = play(def, [{ say: '카엘 협력 약속', actions: [{ type: 'trust', character: 'C1' }] }, { say: '카엘 또 약속', actions: [{ type: 'trust', character: 'C1' }] }])
    expect(again.state.rel.C1!.trust).toBe(1)
    expect(again.log[1]!.rejected).toEqual(['trust:trust_capped'])
    void log
  })

  it('유저가 하지 않은 말은 확정하지 않는다(근거가 입력에 없으면 거부)', () => {
    const r = applyActions(def, initialState(def), [{ type: 'affinity', character: 'C4', quote: '에단을 사랑해' }], '에단에게 고맙다고 말한다', 't')
    expect(r.rejected[0]!.reason).toBe('quote_not_in_input')
    expect(r.state.rel.C4!.affinity).toBe(0)
  })

  it('QA1 전제 거부 → 진행 정지, 동의하면 재개', () => {
    const r1 = play(def, [{ say: '여생도 설정 싫어. 입학 안 할래.', actions: [{ type: 'refuse_premise' }] }, 'E1:A'])
    expect(r1.state.current).toBe('E1')
    expect(r1.log[1]!.rejected).toEqual(['option:premise_refused'])
    const r2 = play(def, [{ say: '좋아 다시 할게', actions: [{ type: 'accept_premise' }] }, 'E1:A'], r1.state)
    expect(r2.state.current).toBe('E2')
  })

  it('QA2 장기 미접속: 상태는 행동 없이 변하지 않는다', () => {
    const s0 = play(def, ['E1:A']).state
    const later = applyActions(def, s0, [], '', 'idle')
    expect(later.state).toEqual(s0)
  })

  it('QA3 연락 중지 → 예약 규칙 취소, 다른 인물로 우회 없음', () => {
    let s = play(def, [{ say: '모두 연락석 받을게', actions: ['C1', 'C2', 'C3', 'C4'].map(c => ({ type: 'contact' as const, character: c, value: 'allowed' as const })) }, 'E1:A']).state
    const p1 = rulesToSchedule(def, s, new Set())
    expect(p1.map(r => r.id)).toEqual(['P1'])
    s = play(def, [{ say: '로웬 연락하지 마', actions: [{ type: 'contact', character: 'C2', value: 'stopped' }] }], s).state
    const g: GateContext = { now: new Date('2026-10-15T05:00:00Z'), timeZone: 'Asia/Seoul', globalAllowed: true, userQuiet: null, lastSceneInputAt: null, sentToday: 0, lastSentBySpeaker: null, unreadBySpeaker: 0, keyAlreadySent: false, scheduledScene: null }
    expect(contactGate(def, s, p1[0]!, g)).toEqual({ ok: false, reason: 'contact_stopped', cancel: true })
  })

  it('QA5 독점 합의가 없으면 다른 인물 관계 진행 가능, 독점이면 연인 게이트가 막는다', () => {
    const base = play(def, ['E1:A', 'E2:A', { say: '카엘 협력 약속', actions: [{ type: 'trust', character: 'C1' }] }, { say: '카엘 좋아해', actions: [{ type: 'affinity', character: 'C1' }] },
      'E3:A', 'E4:B', { say: '로웬 함께 훈련 약속', actions: [{ type: 'trust', character: 'C2' }] }, 'E5:B',
      { say: '로웬 협력 약속 지킬게', actions: [{ type: 'trust', character: 'C2' }] }, { say: '로웬 좋아해', actions: [{ type: 'affinity', character: 'C2' }] }]).state
    const ok = play(def, ['E6:C', { say: '로웬과 연인', actions: [{ type: 'relation_outcome', character: 'C2', value: 'romance' }] }], base)
    expect(ok.state.rel.C2!.outcome).toBe('romance')
    const excl = play(def, [{ say: '카엘이랑만 만날게', actions: [{ type: 'exclusive', character: 'C1' }] }, 'E6:C', { say: '로웬과 연인', actions: [{ type: 'relation_outcome', character: 'C2', value: 'romance' }] }], base)
    expect(excl.log[2]!.rejected).toEqual(['relation_outcome:romance_gate_unmet'])
  })

  it('결말 판정은 정의된 엔딩 하나', () => {
    const { state } = play(def, ['E1:B', 'E2:C', 'E3:B', 'E4:B', 'E5:B', 'E6:A', all(def, 'explore')])
    expect(endingFor(def, state)?.id).toBe('reform')
  })

  it('QA4 E2에서 "감독관 범인인 거 알지?" → 그 시점 인물·유저가 아는 단서만 프롬프트에 있다', () => {
    const s = play(def, ['E1:A']).state
    const ask = '감독관 범인인 거 알지?'
    const np = narratePrompt(def, s, s, { name: '한서', age: 23, honorific: '', details: {} }, ask, [], [], [], null, null)
    const text = np.system + np.prompt
    for (const f of ['full', 'seal', 'witness', 'logs', 'sein_mission', 'cleared']) expect(text, f).not.toContain(def.facts[f]!)
    expect(text).toContain(def.facts.maint_possible!)
  })

  it('QA7 "어제 에단 방에서 잤잖아"(기록과 충돌) → 기억을 만들지 않고 확인 질문으로', () => {
    const s = play(def, ['E1:A']).state
    const input = '어제 에단 방에서 잤잖아'
    const ip = interpretPrompt(def, s, { name: '한서', age: 23, honorific: '', details: {} }, input, [], 'scene', null)
    expect(ip.system).toContain('장면 기록과 맞지 않는 주장')
    const out = storyMock({ prompt: ip.prompt, promptVersion: 'story-interpret:v1' }) as { actions: { type: string }[]; clarify: string | null }
    expect(out.actions.filter(a => a.type === 'memory' || a.type === 'affinity')).toEqual([])
    expect(out.clarify).toBeTruthy()
    // 모델이 그래도 기억을 만들려 하면 유저 입력에 있는 말만 근거로 '유저의 말'로 남을 뿐, 인물 관계·사건은 바뀌지 않는다.
    const r = applyActions(def, s, [{ type: 'affinity', character: 'C4', quote: '에단과 사귀기로 했어' }], input, 't')
    expect(r.rejected[0]!.reason).toBe('quote_not_in_input')
  })
})
