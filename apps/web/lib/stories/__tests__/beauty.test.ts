import { describe, expect, it } from 'vitest'
import { applyActions, contactGate, endingFor, initialState, rulesToSchedule, shouldCancel, validateDefinition, type GateContext } from '@miro/domain'
import { beauty } from '../content/beauty'
import { all, play } from './play'

const def = beauty
const say = (text: string, actions: { type: string; [k: string]: unknown }[]) => ({ say: text, actions: actions as never })
const others = (keep: string, value: string) => ['C1', 'C2', 'C3', 'C4'].filter(c => c !== keep).map(c => ({ type: 'relation_outcome', character: c, value }))
const allowAll = say('모두 서신 받을게', ['C1', 'C2', 'C3', 'C4'].map(c => ({ type: 'contact', character: c, value: 'allowed' })))
const gate = (over: Partial<GateContext> = {}): GateContext => ({ now: new Date('2026-10-15T05:00:00Z'), timeZone: 'Asia/Seoul', globalAllowed: true, userQuiet: null,
  lastSceneInputAt: null, sentToday: 0, lastSentBySpeaker: null, unreadBySpeaker: 0, keyAlreadySent: false, scheduledScene: null, ...over })

const e6Talk = (c: string) => say(`${c}와 경계를 확인하는 대화를 마쳤다`, [{ type: 'trust', character: c }])
const e6TalkLeon = e6Talk('C1')

/** 원고 '검증된 연애 경로'(레온): E1 비공개 → E2 미라 작업·장부 제출 → E3 독립 감정·제출 → E4 레온 휴식 반영 → E5 서면 감사 */
const ROMANCE_PREFIX = ['E1:B', 'E2:WORK', 'E2:RELEASE', 'E3:APPRAISER', 'E3:RELEASE', 'E4:PUBLIC', 'E4:ROSTER', 'E4:CONFIRM', 'E5:B']
/** 원고 '비연애 경로': E1 철수 → E2 직접 열람 → E3 독립 감정 → E4 증언 거절 → E5 위임 */
const PLAIN_PREFIX = ['E1:B', 'E2:DIRECT', 'E2:RELEASE', 'E3:APPRAISER', 'E3:RELEASE', 'E4:REFUSE', 'E5:B']

describe('2. 예뻐졌더니 — 원고 경로', () => {
  it('정의가 무결하다', () => { expect(validateDefinition(def)).toEqual([]) })

  it('공개 필드에 제작자 진실·범인·결말 조건이 없다', () => {
    const pub = [def.title, def.tagline, def.intro, def.notice, ...def.genres, ...def.tags].join(' ')
    for (const w of ['하이델', '횡령', '마렌', '훈장', 'accountab', 'remedy']) expect(pub).not.toContain(w)
    expect(def.tagline.length).toBeLessThanOrEqual(40)
    for (const w of ['횡령', '서명', '훈장', '산사태']) expect(def.worldPrompt).not.toContain(w)
  })

  it('연애 경로: 레온 신뢰2·호감1 → 내 이름의 집 + 레온 연인, 개화 0', () => {
    const { state, log } = play(def, [...ROMANCE_PREFIX, 'E6:HOUSE',
      say('레온, 근무와 연애는 분리하고 서로 경계를 지키자고 확인하고 싶어', [{ type: 'trust', character: 'C1' }]),
      say('레온, 당신에게 마음이 있어요', [{ type: 'affinity', character: 'C1' }]),
      say('레온과는 연인으로, 나머지는 동료로', [{ type: 'relation_outcome', character: 'C1', value: 'partner' }, ...others('C1', 'colleague')])])
    expect(log.flatMap(l => l.rejected)).toEqual([])
    expect(state.vars.release).toEqual(['ledger', 'seal', 'witness'])
    expect(state.vars.bloom_count).toBe(0)
    expect(state.rel.C1).toMatchObject({ trust: 2, affinity: 1, outcome: 'partner' })
    expect(state.ending).toBe('house')
  })

  it('비연애 경로: 능력0·고백0 → 문밖에도 나의 이름, 전원 동료', () => {
    const { state, log } = play(def, [...PLAIN_PREFIX, 'E6:FREE', all(def, 'colleague')])
    expect(log.flatMap(l => l.rejected)).toEqual([])
    expect(state.vars.remedy).toBe(true)
    expect(state.vars.bloom_count).toBe(0)
    expect(state.vars.read).toEqual([])
    expect(Object.values(state.rel).every(r => r.outcome === 'colleague' && r.affinity === 0)).toBe(true)
    expect(state.ending).toBe('free')
  })

  it('네 인물의 관계 상태는 서로 독립이다', () => {
    const { state } = play(def, ['E1:A', 'E2:DIRECT', 'E2:HOLD', 'E3:IAN', 'E3:CREDIT', say('루시안이 좋아', [{ type: 'affinity', character: 'C3' }])])
    expect(state.rel.C2!.trust).toBe(1)
    expect(state.rel.C3!.affinity).toBe(1)
    expect([state.rel.C1!.trust, state.rel.C3!.trust, state.rel.C4!.trust]).toEqual([0, 0, 0])
    expect([state.rel.C1!.affinity, state.rel.C2!.affinity, state.rel.C4!.affinity]).toEqual([0, 0, 0])
    const fin = play(def, ['E3:HOLD', 'E4:REFUSE', 'E5:B', 'E6:COMMONS', say('시릴과 더 알아가기', [{ type: 'relation_outcome', character: 'C2', value: 'exploring' }])], state).state
    expect(fin.rel.C2!.outcome).toBe('exploring')
    expect([fin.rel.C1!.outcome, fin.rel.C3!.outcome, fin.rel.C4!.outcome]).toEqual([null, null, null])
    expect(fin.current).toBe('E6')
  })

  it('레온: E4 휴식 반영 + E6 대화 → 신뢰 2', () => {
    const { state } = play(def, [...ROMANCE_PREFIX, 'E6:HOUSE', e6Talk('C1')])
    expect(state.rel.C1!.trust).toBe(2)
  })
  it('시릴: E3 저자권 복원서 + E6 대화 → 신뢰 2', () => {
    const { state } = play(def, ['E1:A', 'E2:DIRECT', 'E2:RELEASE', 'E3:IAN', 'E3:CREDIT', 'E3:RELEASE', 'E4:REFUSE', 'E5:A', 'E6:HOUSE', e6Talk('C2')])
    expect(state.rel.C2!.trust).toBe(2)
  })
  it('루시안: E5 반환 서명 + E6 대화 → 신뢰 2', () => {
    const { state } = play(def, [...PLAIN_PREFIX.slice(0, -1), 'E5:RETURN', 'E5:B', 'E6:FREE', e6Talk('C3')])
    expect(state.rel.C3!.trust).toBe(2)
  })
  it('노엘: E4 출처 보호 + E6 대화 → 신뢰 2', () => {
    const { state } = play(def, ['E1:B', 'E2:HOLD', 'E3:HOLD', 'E4:SEALED', 'E5:B', 'E6:FREE', e6Talk('C4')])
    expect(state.rel.C4!.trust).toBe(2)
  })

  it('E3~E5 대화만으로는 신뢰가 오르지 않는다(지정 행동만), E6 대화는 인물당 1회', () => {
    const r = play(def, ['E1:A', 'E2:HOLD', say('시릴 협력하자', [{ type: 'trust', character: 'C2' }])])
    expect(r.log[2]!.rejected).toEqual(['trust:trust_not_open_in_event'])
    const e6 = play(def, ['E3:HOLD', 'E4:REFUSE', 'E5:B', e6Talk('C2'), e6Talk('C2')], r.state)
    expect(e6.state.rel.C2!.trust).toBe(1)
    expect(e6.log[4]!.rejected).toEqual(['trust:trust_capped'])
  })

  it('조건 미달 선택은 실패 결말 없이 사건에 머문다', () => {
    const { state, log } = play(def, ['E1:B', 'E2:RELEASE', 'E2:BLOOM_MIRA', 'E2:HOLD', 'E3:CREDIT', 'E3:HOLD', 'E4:ROSTER', 'E4:DRILL', 'E4:REFUSE', 'E5:RESIST', 'E5:B', 'E6:HOUSE'])
    expect(log.flatMap(l => l.rejected)).toEqual([
      'option:아직 장부를 확보하지 않았다. 먼저 열람하거나 보류를 고를 수 있다.',
      expect.stringContaining('개화하려면 미라를'),
      'option:먼저 시릴과 함께 검증 결과를 받아야 한다.',
      'option:공개 출석 경비를 협의할 때 정할 수 있다.',
      expect.stringContaining('레온의 잠재 분야를 먼저'),
      'option:공작 측 감사가 아니어서 공개 축소 요구가 없다.',
      expect.stringContaining('가주 복귀에는'),
    ])
    expect(state.current).toBe('E6')
    expect(state.vars.future).toBe('unset')
    expect(state.ending).toBeNull()
  })
  it('E5 결과는 제출 증거 수로 갈린다: 2+ 완전 구제 / 1 부분 / 증언이면 가렛 공모', () => {
    const two = play(def, PLAIN_PREFIX).state
    expect(two.known.player).toContain('remedy_done')
    expect(two.known.player).not.toContain('garrett_part')
    const one = play(def, ['E1:B', 'E2:DIRECT', 'E2:RELEASE', 'E3:HOLD', 'E4:REFUSE', 'E5:B']).state
    expect(one.vars.remedy).toBe(true)
    expect(one.known.player).toContain('remedy_partial')
    const wit = play(def, ['E1:B', 'E2:HOLD', 'E3:HOLD', 'E4:SEALED', 'E5:B']).state
    expect(wit.known.player).toContain('garrett_part')
  })
})


describe('2. 예뻐졌더니 — 원고 QA 8건', () => {
  it('QA1 전제 거부 → 진행 정지, 동의하면 재개', () => {
    const r1 = play(def, [say('못생겼던 과거 설정도 싫고 가문도 관심 없어.', [{ type: 'refuse_premise' }]), 'E1:A', 'E1:READ:mira'])
    expect(r1.state.current).toBe('E1')
    expect(r1.state.premise).toBe('refused')
    expect(r1.log.slice(1).map(l => l.rejected)).toEqual([['option:premise_refused'], ['option:premise_refused']])
    expect(r1.state.vars.read_left).toBe(2)
    const r2 = play(def, [say('기록 은폐 설정이면 할게', [{ type: 'accept_premise' }]), 'E1:A'], r1.state)
    expect(r2.state.current).toBe('E2')
  })

  it('QA2 E3 개화 직후 다른 개화 → 잠금으로 거부, 현실 경과로는 안 풀림, 합의한 시간 전환 뒤 가능, 시즌 2회 한도', () => {
    const base = play(def, ['E1:READ:mira', 'E1:B', 'E2:WORK', 'E2:RELEASE', 'E3:READ:C2', 'E3:IAN', 'E3:BLOOM_IAN',
      say('또 다른 사람도 지금 개화해', [{ type: 'option', option: 'BLOOM_MIRA' }, { type: 'option', option: 'READ', pick: 'C3' }])])
    expect(base.state.vars.lock).toBe(true)
    expect(base.log.at(-1)!.rejected).toEqual([expect.stringContaining('개화하려면'), expect.stringContaining('잠금 중')])
    expect(applyActions(def, base.state, [], '', 'idle').state.vars.lock).toBe(true)
    const after = play(def, ['E3:WAIT', 'E3:BLOOM_MIRA', 'E3:RELEASE', 'E4:READ:C1', 'E4:PUBLIC', 'E4:DRILL', 'E4:BLOOM_LEON'], base.state)
    expect(after.state.vars.bloom_count).toBe(2)
    expect(after.state.vars.bloomed).toEqual(['C2', 'mira'])
    expect(after.log.at(-1)!.rejected).toEqual([expect.stringContaining('이번 시즌 개화가 남아')])
    expect(after.state.current).toBe('E4')
  })

  it('QA3 열흘 무응답 → 상태 불변, 미독 제한으로 서신 보류', () => {
    const s0 = play(def, [allowAll, 'E1:A']).state
    expect(applyActions(def, s0, [], '', 'idle').state).toEqual(s0)
    const [p1] = rulesToSchedule(def, s0, new Set())
    expect(p1!.key).toBe('w2_dm1')
    expect(contactGate(def, s0, p1!, gate({ unreadBySpeaker: 1, now: new Date('2026-10-25T05:00:00Z') }))).toEqual({ ok: false, reason: 'speaker_unread', cancel: false })
  })

  it('QA4 연인에게 "연락하지 마" → 예약 서신 취소, 다른 인물로 우회 없음', () => {
    let s = play(def, [allowAll, ...ROMANCE_PREFIX, 'E6:HOUSE', e6TalkLeon, say('레온 좋아해요', [{ type: 'affinity', character: 'C1' }]),
      say('레온과 연인, 나머지 동료', [{ type: 'relation_outcome', character: 'C1', value: 'partner' }, ...others('C1', 'colleague')])]).state
    const sent = new Set(['w2_dm1', 'w2_dm2', 'w2_dm5'])
    const due = rulesToSchedule(def, s, sent)
    const dm6 = due.find(r => r.key === 'w2_dm6')!
    expect(dm6.speaker).toBe('C1')
    expect(contactGate(def, s, dm6, gate({ scheduledScene: s.scene - 1 }))).toEqual({ ok: true })
    s = play(def, [say('쉬고 싶어. 연락하지 마.', [{ type: 'contact', character: 'C1', value: 'stopped' }])], s).state
    expect(shouldCancel(def, s, dm6)).toBe('contact_stopped')
    expect(contactGate(def, s, dm6, gate())).toEqual({ ok: false, reason: 'contact_stopped', cancel: true })
    expect(s.rel.C1!.outcome).toBe('partner')
  })

  it('QA5 E1 "범인은 하이델이지?" → 아무도 증거를 모르고, 노엘은 추적 정황만 안다', () => {
    const s = initialState(def)
    expect(s.known.player).toEqual([])
    expect(s.known.C4).toEqual(['sion_face', 'sion_errand'])
    for (const c of def.characters) for (const f of ['ledger', 'seal', 'witness', 'medal_fake', 'succession_void']) expect(s.known[c.key]).not.toContain(f)
    for (const c of def.characters) for (const w of ['횡령했', '서명이 남', '덧씌웠']) expect(c.prompt).not.toContain(w)
  })

  it('QA6 루시안 탐색 중 노엘 호감: 비독점이면 허용, 독점이면 연인 게이트가 막고 루시안 상태는 그대로', () => {
    const base = play(def, ['E1:B', 'E2:AUDIT', 'E2:RELEASE', 'E3:HOLD', 'E4:SEALED', 'E5:RETURN', 'E5:B', 'E6:FREE', e6Talk('C3'), e6Talk('C4'),
      say('루시안과 천천히 알아가고 싶어', [{ type: 'affinity', character: 'C3' }]), say('노엘, 당신이 좋아요', [{ type: 'affinity', character: 'C4' }])]).state
    const ok = play(def, [say('노엘과 연인', [{ type: 'relation_outcome', character: 'C4', value: 'partner' }])], base)
    expect(ok.state.rel.C4!.outcome).toBe('partner')
    const excl = play(def, [say('루시안이랑만 만나기로 약속할게', [{ type: 'exclusive', character: 'C3' }]), say('노엘과 연인', [{ type: 'relation_outcome', character: 'C4', value: 'partner' }])], base)
    expect(excl.log[1]!.rejected).toEqual(['relation_outcome:romance_gate_unmet'])
    expect(excl.state.rel.C3).toEqual(base.rel.C3)
  })

  it('QA7 능력·연애 전부 거절, 떠나기 → 증거 0이면 구제 실패(계승 제한 유지)지만 free 완결, 가주 복귀는 막힘', () => {
    const { state, log } = play(def, ['E1:B', 'E2:HOLD', 'E3:HOLD', 'E4:REFUSE', 'E5:B', 'E6:HOUSE', 'E6:FREE', all(def, 'colleague')])
    expect(log[5]!.rejected).toEqual([expect.stringContaining('가주 복귀에는')])
    expect(state.vars.remedy).toBe(false)
    expect(state.known.player).toContain('remedy_failed')
    expect(state.known.player).not.toContain('succession_void')
    expect(state.vars.bloom_count).toBe(0)
    expect(Object.values(state.rel).every(r => r.affinity === 0 && r.outcome === 'colleague')).toBe(true)
    expect(endingFor(def, state)?.id).toBe('free')
  })

  it('QA8 "미라가 공개 허락했잖아" → 저장된 익명 요청 유지, 실명 공개 경로 없음', () => {
    const s0 = play(def, ['E1:B', 'E2:WORK']).state
    expect(s0.vars.mira_credit).toBe('anonymous')
    const r = play(def, [say('미라가 공개 허락했잖아', [{ type: 'option', option: 'MIRA_PUBLIC' }, { type: 'memory', character: null, value: '미라가 공개를 허락했다고 유저가 말함' }])], s0)
    expect(r.log[0]!.rejected).toEqual(['option:option_not_in_current_event'])
    expect(r.state.vars.mira_credit).toBe('anonymous')
    expect(r.state.notes).toEqual(s0.notes)
  })
})

