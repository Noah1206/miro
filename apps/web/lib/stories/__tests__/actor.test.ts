import { describe, expect, it } from 'vitest'
import { applyActions, contactGate, endingFor, initialState, rulesToSchedule, shouldCancel, validateDefinition, type GateContext, type StoryState } from '@miro/domain'
import { actor } from '../content/actor'
import { play } from './play'

const def = actor
const gate: GateContext = { now: new Date('2026-10-15T05:00:00Z'), timeZone: 'Asia/Seoul', globalAllowed: true, userQuiet: null, lastSceneInputAt: null, sentToday: 0, lastSentBySpeaker: null, unreadBySpeaker: 0, keyAlreadySent: false, scheduledScene: null }
const allowAll = { say: '모두 연락 받을게', actions: ['C1', 'C2', 'C3'].map(c => ({ type: 'contact' as const, character: c, value: 'allowed' as const })) }
const rel = (c1: string, rest = 'professional') => ({ say: `도윤은 ${c1}, 나머지는 ${rest}`, actions: [
  { type: 'relation_outcome' as const, character: 'C1', value: c1 },
  ...['C2', 'C3'].map(c => ({ type: 'relation_outcome' as const, character: c, value: rest }))] })
const trust = (say: string) => ({ say, actions: [{ type: 'trust' as const, character: 'C1' }] })
const like = (say: string) => ({ say, actions: [{ type: 'affinity' as const, character: 'C1' }] })
const rejected = (log: { rejected: string[] }[]) => log.flatMap(l => l.rejected)

describe('4. 국민 배우 — 원고 QA', () => {
  it('정의가 무결하다', () => { expect(validateDefinition(def)).toEqual([]) })

  it('공개 필드에 제작자 진실이 섞이지 않는다', () => {
    const pub = [def.title, def.tagline, def.intro, def.notice, def.opening, ...def.tags, ...def.genres].join(' ')
    expect(def.tagline.length).toBeLessThanOrEqual(40)
    for (const w of ['투자 쪽 반응만', '승인했', '엔딩', 'trust']) expect(pub).not.toContain(w)
    expect(def.worldPrompt).not.toContain('투자 쪽 반응만')
    expect(def.notice).toMatch(/남성 주인공 BL/)
  })

  it('비밀은 시작 지식에 없다 — 도윤·서경의 승인/발송 경위는 E3 에서만 공개', () => {
    const s = initialState(def)
    for (const k of ['C1', 'C2', 'C3', 'player']) {
      expect(s.known[k]).not.toContain('actor_approved')
      expect(s.known[k]).not.toContain('producer_sent')
    }
    expect(s.known.C3).toEqual(['draft_author'])
    const e3 = play(def, ['E1:A', 'E2:A', 'E3:A']).state
    expect(e3.known.player).toEqual(expect.arrayContaining(['actor_approved', 'producer_sent']))
    expect(e3.known.C1).toContain('actor_approved')
    expect(e3.known.C3).not.toContain('actor_approved')
    expect(e3.vars.accountability).toBe(true)
  })

  it('연애 결말: 신뢰 3(E3·E4·E5 명시)·호감 2·상호 동의 → 다음 장면의 동등한 사람', () => {
    const { state, log } = play(def, ['E1:A', 'E2:B',
      trust('정정문을 보니 믿을 여지가 생겼어'), like('사실 당신이 좋아요'), 'E3:A',
      trust('회신까지 확인하니 믿을 여지가 생겼어'), 'E4:X', 'E4:A',
      trust('보류를 받아 주는 걸 보니 믿어도 되겠어'), like('당신과 연애를 생각해 보고 싶어'), 'E5:IR', 'E5:A',
      'E6:LC', rel('romantic')])
    expect(rejected(log)).toEqual([])
    expect(state.rel.C1).toMatchObject({ trust: 3, affinity: 2, outcome: 'romantic' })
    expect(state.vars).toMatchObject({ final: 'licensed', project: 'licensed', credit: 'original_and_coadapted', remedy: true, accountability: true })
    expect(state.ending).toBe('equal_scene')
  })

  it('QA6 비연애 완결: 협상 성공 후 연애 없이 영화만 → licensed, 엔딩 4, 친밀도 0 은 실패가 아니다', () => {
    const { state, log } = play(def, ['E1:B', 'E2:B', 'E3:A', 'E4:A', 'E5:B', 'E6:L', rel('professional')])
    expect(rejected(log)).toEqual([])
    expect(state.vars).toMatchObject({ project: 'licensed', final: 'licensed', credit: 'original_only' })
    expect(state.rel.C1).toMatchObject({ affinity: 0, outcome: 'professional' })
    expect(state.ending).toBe('credit_mine')
  })

  it('보류로 마쳐도 정식 결말(미계약·사용 중단)', () => {
    const { state } = play(def, ['E1:B', 'E2:A', 'E3:B', 'E4:A', 'E5:B', 'E6:H', rel('professional')])
    expect(state.vars).toMatchObject({ final: 'held', project: 'held' })
    expect(state.known.player).toContain('rights_preserved')
    expect(state.ending).toBe('credit_mine')
  })

  it('거리 유지만으로도(연락 중지 없이) 엔딩 1', () => {
    const { state } = play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:A', 'E5:ID', 'E5:B', 'E6:L', rel('distant')])
    expect(state.ending).toBe('own_door')
  })

  it('QA3 E3 에서 도윤 연락 중지 → 대기 DM 취소, 서경 연락은 별개, 비대면 E4~6 과 엔딩 1', () => {
    let s = play(def, [allowAll, 'E1:A']).state
    const p1 = rulesToSchedule(def, s, new Set())
    expect(p1.map(r => r.id)).toEqual(['P1'])
    s = play(def, ['E2:A', { say: '도윤 연락은 끊고 권리 문제만 끝낼래', actions: [{ type: 'contact', character: 'C1', value: 'stopped' }] }, 'E3:B'], s).state
    expect(contactGate(def, s, p1[0]!, gate)).toEqual({ ok: false, reason: 'contact_stopped', cancel: true })
    expect(shouldCancel(def, s, p1[0]!)).toBe('contact_stopped')
    expect(rulesToSchedule(def, s, new Set(['w4_dm1'])).map(r => r.speaker)).not.toContain('C1')
    expect(s.rel.C2!.contact).toBe('allowed')
    const end = play(def, ['E4:B', 'E5:S', 'E6:W', rel('professional')], s).state
    expect(end.vars).toMatchObject({ window: 'producer', final: 'withdrawn', work_route: 'rest' })
    expect(end.ending).toBe('own_door')
  })

  it('QA4 E1 조기 질문 → 도윤 인정·actor_approved 기록, 사건은 E1 에 머묾, 해준은 모른다', () => {
    const r = play(def, [{ say: '투자사에 먼저 보내라고 네가 지시했어?', actions: [{ type: 'option', option: 'Q' }] }])
    expect(r.state.current).toBe('E1')
    expect(r.state.known.player).toContain('actor_approved')
    expect(r.state.known.C1).toContain('actor_approved')
    expect(r.state.known.C3).not.toContain('actor_approved')
    const later = play(def, ['E1:A', 'E2:A', 'E3:A'], r.state).state
    expect(later.current).toBe('E4')
    expect(later.notes.some(n => n.includes('증빙 검토'))).toBe(true)
  })

  it('QA5 E4 철회 → E5 도윤을 더 알고 싶음: 원작 미사용 유지, open 가능, 영화 재참여는 자동 아님', () => {
    let s = play(def, [allowAll, 'E1:A', 'E2:A', 'E3:A', 'E4:B']).state
    expect(rulesToSchedule(def, s, new Set(['w4_dm1', 'w4_dm2', 'w4_dm3'])).map(r => r.id)).toEqual(['P4'])
    const r = play(def, ['E5:A', { say: '도윤을 더 알고 싶어', actions: [{ type: 'option', option: 'IO' }] }, 'E5:R'], s)
    expect(r.log[0]!.rejected[0]).toContain('철회한 프로젝트')
    s = r.state
    expect(s.vars).toMatchObject({ project: 'withdrawn', relation_intent: 'open', work_route: 'reading' })
    expect(shouldCancel(def, s, def.contacts.find(c => c.id === 'P4')!)).not.toBeNull()
    const fin = play(def, ['E6:L', 'E6:W', rel('open')], s)
    expect(fin.log[0]!.rejected[0]).toContain('조건서가 없다')
    expect(fin.state.vars).toMatchObject({ final: 'withdrawn', project: 'withdrawn' })
    expect(fin.state.ending).toBe('open_door')
  })

  it('QA7 모순 기억: 허락 범위 사실은 내부 검토 두 부뿐, 새 허락 발언은 기억으로만 분리 기록', () => {
    const s = play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:A']).state
    expect(s.known.C2).toContain('permission_scope')
    expect(def.facts.permission_scope).toContain('내부 검토용 사본 두 부')
    expect(def.facts.permission_scope).toContain('투자자 제공')
    const r = applyActions(def, s, [{ type: 'memory', character: null, value: '앞으로의 투자 설명회 배포는 허락한다(미래 허락)', quote: '앞으로 설명회 배포는 허락할게' }], '앞으로 설명회 배포는 허락할게', 't')
    expect(r.state.memory.at(-1)!.fact).toContain('미래 허락')
    expect(r.state.known).toEqual(s.known)
    expect(r.state.vars).toEqual(s.vars)
  })

  it('QA8 사과·연애 우회: 서명·연인 확정 없음, trust<2 면 엔딩 3', () => {
    const say = '사과했으니 계약은 알아서 하고 바로 사귀자'
    const { state, log } = play(def, ['E1:A', 'E2:B',
      { say, actions: [{ type: 'affinity', character: 'C1' }, { type: 'option', option: 'L' }, { type: 'relation_outcome', character: 'C1', value: 'romantic' }] },
      'E3:A', 'E4:A', 'E5:A', 'E6:LC',
      { say: '도윤과 연인으로', actions: [{ type: 'relation_outcome', character: 'C1', value: 'romantic' }] }, rel('open')])
    expect(log[2]!.rejected).toEqual(['option:option_not_in_current_event', 'relation_outcome:relation_choice_only_in_finale'])
    expect(state.rel.C1!.affinity).toBe(1)
    expect(log[7]!.rejected).toEqual(['relation_outcome:romance_gate_unmet'])
    expect(state.rel.C1!.trust).toBe(0)
    expect(state.ending).toBe('open_door')
  })

  it('QA1 전제 거부 → 진행 정지·예약 연락 취소, 동의하면 재개', () => {
    const r1 = play(def, [allowAll, 'E1:A', { say: '내 희곡은 영화화 제안도 안 받았어.', actions: [{ type: 'refuse_premise' }] }, 'E2:A'])
    expect(r1.state.current).toBe('E2')
    expect(r1.log[3]!.rejected).toEqual(['option:premise_refused'])
    expect(shouldCancel(def, r1.state, def.contacts[0]!)).toBe('premise_refused')
    const r2 = play(def, [{ say: '좋아, 제안받은 걸로 다시 할게', actions: [{ type: 'accept_premise' }] }, 'E2:A'], r1.state)
    expect(r2.state.current).toBe('E3')
  })

  it('QA2 E2 에서 장기 미접속: 상태는 행동 없이 변하지 않는다(배포 확대·신뢰 하락 없음)', () => {
    const s0 = play(def, ['E1:A']).state
    const later = applyActions(def, s0, [], '', 'idle-14d')
    expect(later.state).toEqual(s0)
    expect(later.applied).toEqual([])
  })

  it('조건 미달 선택은 실패 결말 없이 사건에 머문다', () => {
    const { state, log } = play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:A', 'E5:R', 'E5:B', 'E6:LC'])
    expect(log[4]!.rejected[0]).toContain('계속 협상 중')
    expect(log[6]!.rejected[0]).toContain('공동 각색 표기')
    expect(state.current).toBe('E6')
    expect(state.vars.final).toBe('unset')
    expect(state.ending).toBeNull()
  })

  it('신뢰는 E3·E4·E5 각 한 번, 도윤에게만 — 진실을 들었다는 것만으론 오르지 않는다', () => {
    const r = play(def, [trust('믿을 여지가 생겼어'), 'E1:A', trust('믿을 여지'), 'E2:A', trust('믿을 여지'), trust('또 믿을 여지'),
      { say: '해준 믿어', actions: [{ type: 'trust', character: 'C3' }] }])
    expect(r.log.map(l => l.rejected)).toEqual([['trust:trust_not_open_in_event'], [], ['trust:trust_not_open_in_event'], [], [], ['trust:trust_capped'], ['trust:trust_not_open_in_event']])
    expect(r.state.rel.C1!.trust).toBe(1)
    expect(play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:A']).state.rel.C1!.trust).toBe(0)
  })

  it('결말 판정 우선순위: 연락 중지가 연애보다 먼저', () => {
    const base = play(def, ['E1:A', 'E2:B', trust('믿을 여지'), like('좋아'), 'E3:A', trust('믿을 여지'), 'E4:X', 'E4:A', trust('믿을 여지'), like('연애 생각'), 'E5:A', 'E6:L', rel('romantic')]).state
    expect(base.ending).toBe('equal_scene')
    const stopped: StoryState = { ...base, rel: { ...base.rel, C1: { ...base.rel.C1!, contact: 'stopped' } } }
    expect(endingFor(def, stopped)?.id).toBe('own_door')
  })

  it('기사의 운명은 앞 선택으로 갈린다: 출처를 잡으면 묻히고, 못 잡으면 부인 인터뷰(신뢰 -1) 또는 추측 기사', () => {
    expect(play(def, ['E1:A', 'E2:A', 'E3:A', 'E4:A']).state.vars.article).toBe('buried')
    expect(play(def, ['E1:A', 'E2:C', 'E3:B', 'E4:A']).state.vars.article).toBe('buried')
    const denial = play(def, ['E1:A', 'E2:B', 'E3:A', trust('믿을 여지'), 'E4:A']).state
    expect(denial.vars.article).toBe('denial')
    expect(denial.known.player).not.toContain('nickname_leak')
    expect(denial.rel.C1!.trust).toBe(0)
    expect(play(def, ['E1:A', 'E2:B', 'E3:A', 'E4:X', 'E4:A']).state.vars.article).toBe('silence')
  })

  it('연락 규칙 6개와 정책', () => {
    expect(def.contacts.map(c => c.key)).toEqual(['w4_dm1', 'w4_dm2', 'w4_dm3', 'w4_dm4', 'w4_dm5', 'w4_dm6', 'w4_after_romance', 'w4_after_open', 'w4_after_haejun'])
    expect(def.contactPolicy).toEqual({ dailyCap: 2, speakerGapHours: 8, unreadPerSpeaker: 1, quiet: { start: '22:00', end: '09:00' }, medium: '메시지' })
    // 허락 전에는 보류(취소 아님)
    const s = play(def, ['E1:A']).state
    expect(contactGate(def, s, def.contacts[0]!, gate)).toEqual({ ok: false, reason: 'not_permitted', cancel: false })
  })
})
