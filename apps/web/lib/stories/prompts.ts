import { currentEvent, evalCond, eventOf, optionOpen, type StoryCharacter, type AppliedChange, type Rejected, type StoryDefinition, type StoryState } from '@miro/domain'
import type { Protagonist } from './repo'

export const INTERPRET_VERSION = 'story-interpret:v1'
export const NARRATE_VERSION = 'story-narrate:v2'
export const DM_VERSION = 'story-dm:v1'

export type LogLine = { channel: 'scene' | 'dm'; thread: string | null; role: string; speaker: string | null; content: string }

/**
 * 프롬프트에 들어가는 것의 경계(비밀 누설 방지):
 * - 제작자 진실(creatorTruth)·엔딩 조건·연락 규칙·아직 오지 않은 사건은 절대 넣지 않는다.
 * - 사건 상황은 '지금 사건' 것만. 사실은 그 인물/유저가 실제로 아는 것만(state.known).
 */
/** 비밀을 암시하는 말투 예시는 공개 조건이 맞을 때만. */
export function visibleLines(def: StoryDefinition, s: StoryState, c: StoryCharacter): Partial<StoryCharacter['lines']> {
  return Object.fromEntries(Object.entries(c.lines).filter(([k]) => { const g = c.lineGates?.[k as keyof StoryCharacter['lines']]; return !g || evalCond(def, s, g) }))
}

export function knownFacts(def: StoryDefinition, s: StoryState, who: string): string[] {
  return (s.known[who] ?? []).map(id => def.facts[id]).filter((x): x is string => !!x)
}

function protagonistLines(def: StoryDefinition, p: Protagonist): string {
  const extra = Object.entries(p.details).map(([k, v]) => `${k}: ${v}`).join(' / ')
  return `주인공(유저): ${p.name}, 만 ${p.age}세, ${def.protagonist.role}.${p.honorific ? ` 호칭: ${p.honorific}.` : ''}${extra ? ` ${extra}.` : ''} 유저가 정하지 않은 성격·감정·과거·외모는 지어내지 않는다.`
}

function relationWords(def: StoryDefinition, s: StoryState, key: string): string {
  const r = s.rel[key]!
  const trust = r.trust === 0 ? '아직 쌓인 신뢰 없음' : r.trust === 1 ? '조금 믿기 시작함' : r.trust < 4 ? '믿음이 있음' : '깊이 신뢰함'
  const aff = r.affinity === 0 ? '연애 감정 표현 없음' : '유저가 연애 감정을 명시적으로 표현한 적 있음'
  return `${trust}; ${aff}; 연락석: ${r.contact === 'stopped' ? '유저가 연락 중지를 요청함(먼저 연락하지 않는다)' : r.contact === 'allowed' ? '허용' : '미동의'}${r.boundaries.length ? `; 유저의 경계: ${r.boundaries.join(', ')}` : ''}${s.exclusive ? `; 독점 합의 상대: ${def.characters.find(c => c.key === s.exclusive)?.name}` : ''}`
}

function logText(def: StoryDefinition, lines: LogLine[], p: Protagonist): string {
  const name = (k: string | null) => (k ? def.characters.find(c => c.key === k)?.name ?? k : '')
  return lines.map(l => l.role === 'user' ? `${p.name}: ${l.content}` : l.role === 'character' ? `${name(l.speaker)}: ${l.content}` : `[장면] ${l.content}`).join('\n')
}

export function interpretPrompt(def: StoryDefinition, s: StoryState, p: Protagonist, input: string, recent: LogLine[], channel: 'scene' | 'dm', thread: string | null) {
  const ev = currentEvent(def, s)
  const system = `너는 인터랙티브 스토리의 입력 해석기다. 유저 입력이 무엇을 했는지 판단해 JSON 으로 '제안'만 한다. 상태를 정하는 것은 서버다.
규칙:
- 유저가 실제로 말하거나 행동한 것만 담는다. 고백·접촉·용서·동의·연애 의도·관계 결정은 유저 입력에 명시돼 있을 때만.
- 모든 action 의 quote 는 유저 입력에서 그대로 복사한 연속 부분 문자열이다(바꿔 쓰지 않는다).
- 선택지는 예시일 뿐이다. 자유 입력이 어떤 선택의 의미와 같으면 그 option 을, 어느 것과도 같지 않으면 option 없이 둔다(장면은 자유 행동으로 계속된다).
- 사건을 끝내는 선택·연인 관계·독점·연락 중지처럼 중요한 결정이 모호하면 그 action 을 넣지 말고 clarify 에 짧은 확인 질문을 쓴다.
- trust: 그 인물과 약속·증거·협력 범위를 명시적으로 확인하거나 합의한 대화일 때만. affinity: 유저가 그 인물에게 연애 감정을 명시적으로 표현했을 때만 — 친절·감사·구조·협력은 affinity 가 아니다.
- contact: "연락하지 마/연락 그만/쉬고 싶어 연락 말아" → stopped, "연락해도 돼/연락석 받을게" → allowed. 인물을 특정하지 않은 전체 요청이면 모든 인물에 각각.
- relation_outcome: 결말 사건에서 유저가 인물과의 관계를 정했을 때만. value 는 ${def.relation.outcomes.join('|')} 중 하나.
- exclusive: 유저가 한 인물과만 독점 관계를 맺겠다고 명시(character), 해제(character null).
- refuse_premise: 작품의 기본 전제(주인공 역할) 자체를 거부. accept_premise: 거부 뒤 다시 받아들임.
- time_skip: 유저가 시간 건너뛰기를 요청하거나 동의.
- memory: 유저가 밝힌 자기 사실·선호(character 는 관련 인물 또는 null). promise: 유저와 인물이 실제로 맺은 약속(character 필수).
- 장면 기록과 맞지 않는 주장(예: 없었던 일)은 action 으로 만들지 말고 clarify 로 확인한다.
type 은 option|trust|affinity|contact|boundary|relation_outcome|exclusive|memory|promise|refuse_premise|accept_premise|time_skip 중 하나만. 해당하는 행동이 없으면 actions 는 빈 배열.
JSON: {"actions":[{"type":..., "character": 인물키|null, "option": 선택id|null, "pick": 값|null, "value": 값|null, "quote": "..."}], "clarify": 문자열|null}`
  const options = channel === 'dm' ? [] : (ev?.options ?? []).map(o => ({ id: o.id, example: o.hint, meaning: o.meaning, available: optionOpen(def, s, o).ok, ...(o.pick ? { pick: o.pick.choices } : {}) }))
  const prompt = JSON.stringify({
    channel: channel === 'dm' ? `연락석 대화(상대: ${thread}) — option·time_skip·relation_outcome·refuse_premise 는 쓰지 않는다` : '장면',
    event: ev ? { id: ev.id, goal: ev.goal, final: !!ev.final, options } : { id: 'ended', note: '시즌 종료 후 일상' },
    characters: def.characters.map(c => ({ key: c.key, name: c.name })),
    premise: s.premise,
    protagonist: p.name,
    recent: logText(def, recent.slice(-8), p),
    input,
  })
  return { system, prompt }
}

export function narratePrompt(def: StoryDefinition, before: StoryState, after: StoryState, p: Protagonist, input: string, recent: LogLine[],
  applied: AppliedChange[], rejected: Rejected[], clarify: string | null, completed: string | null) {
  const ev = currentEvent(def, after)
  const done = completed ? eventOf(def, completed) : undefined
  const chosen = done ? done.options.find(o => o.id === after.choices[done.id]) : undefined
  const prevEv = currentEvent(def, before)
  const unmet = rejected.filter(r => r.action.type === 'option').map(r => {
    const o = prevEv?.options.find(x => r.action.type === 'option' && x.id === r.action.option)
    return o?.unmet ?? r.reason
  })
  const system = `${def.worldPrompt}

장면 작성 규칙:
- 장면 하나(400~800자): 서술과 인물의 대사. 유저(주인공)의 대사·행동·감정·결정을 새로 쓰지 않는다. 유저 입력은 이미 일어난 일로 받고 그 결과와 주변 반응만 쓴다.
- 첫 사건에서는 주변 인물이 자신의 목적에 따라 먼저 구체적인 말이나 행동을 건넨다. 유저의 한마디를 요약하고 동의하는 데서 끝내지 않는다. 질문에는 먼저 답하고, 짧은 입력을 곧바로 사건 해결·시간 점프로 확대하지 않는다.
- 말투는 인물별 지시와 현재 관계를 따른다. 모든 인물을 상담자처럼 정중하게 만들거나 매번 선택권·동의를 설명하는 안내문을 붙이지 않는다. 경계는 행동으로 지키고, 끝맺음은 그 인물이 그 자리에서 할 법한 말이나 아직 해결되지 않은 구체적 상황으로 한다.
- 공개 프롤로그에서 이미 시작된 현장에 이어 쓴다. 프롤로그를 다시 재생하거나 새 첫 만남을 만들지 않는다. 유저가 설정한 성격과 배경은 맥락이며, 새로운 유저 대사를 대신 쓰라는 지시가 아니다.
- 인물은 각자 '알고 있는 사실' 목록 안에서만 말한다. 목록에 없는 비밀(범인·정체·숨은 동기)은 추측으로도 단정하지 않는다. 모르면 모른다고 하거나 확인 방법을 말한다.
- '서버가 반영하지 않은 행동'은 일어나지 않은 것으로 다룬다(필요하면 왜 안 되는지 장면 안에서 자연스럽게).
- 확인 질문이 있으면 장면 끝에 짧게 묻는다. 사건이 끝났으면 결과를 보여 주고 다음 상황으로 자연스럽게 잇는다.
- 다음 선택을 버튼처럼 나열하지 말고 열린 상황으로 끝낸다. 시간은 유저가 동의한 만큼만 흐른다.
- 성적 강요, 침묵을 동의로 해석하기, 구조나 친절을 사랑으로 환산하기 금지.
JSON: {"blocks":[{"kind":"narration"|"dialogue","speaker":인물키|null,"text":"..."}]}`
  const prompt = JSON.stringify({
    entry: def.entry ? { world: def.entry.world, role: def.entry.role, arrival: def.entry.arrival, rules: def.entry.rules } : undefined,
    opening: recent.some(l => l.channel === 'scene' && l.role !== 'user') ? undefined : [def.entry?.prelude, def.opening].filter(Boolean).join('\n\n'),
    protagonist: protagonistLines(def, p),
    premise: after.premise === 'refused' ? '유저가 작품 전제를 거부했다 — 진행하지 말고 설정 협의(다른 진입 상황)나 재시작을 제안한다. 강제로 같은 사건을 반복하지 않는다.' : undefined,
    completed: done ? { title: done.title, result: chosen?.result } : undefined,
    event: ev ? { title: ev.title, goal: ev.goal, situation: ev.situation, cast: ev.cast } : { ended: true, note: '시즌이 끝났다. 정해진 진로와 관계를 바탕으로 합의된 일상만 그린다. 새 사건·누명 재발·연애 확정을 임의로 추가하지 않는다.' },
    characters: def.characters.map(c => ({ key: c.key, name: c.name, age: c.age, look: c.look, direction: c.prompt, lines: visibleLines(def, after, c), schedule: c.schedule,
      knows: knownFacts(def, after, c.key), relation: relationWords(def, after, c.key) })),
    playerKnows: knownFacts(def, after, 'player'),
    state: describeVars(def, after),
    memory: after.memory.slice(-12).map(m => m.fact),
    promises: after.promises.slice(-8).map(m => `${def.characters.find(c => c.key === m.who)?.name ?? m.who}: ${m.fact}`),
    applied: applied.filter(a => !['choice', 'event_complete'].includes(a.kind)).map(a => ({ kind: a.kind, ...a.detail, cause: undefined })),
    notApplied: rejected.map(r => ({ type: r.action.type, reason: r.reason })),
    unmetChoice: unmet.length ? unmet : undefined,
    clarify,
    recent: logText(def, recent.slice(-14), p),
    input,
  })
  return { system, prompt }
}

function describeVars(def: StoryDefinition, s: StoryState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, d] of Object.entries(def.vars)) if (d.label) out[d.label] = s.vars[k]
  return out
}

export function dmPrompt(def: StoryDefinition, s: StoryState, p: Protagonist, speaker: string, input: string, thread: LogLine[], scene: LogLine[], rejected: Rejected[]) {
  const c = def.characters.find(x => x.key === speaker)!
  const system = `너는 ${c.name}(${c.age}세)이다. ${c.prompt}
지금은 작품 속 매체 '${def.contactPolicy.medium}'로 주고받는 문자 대화다(실제 메신저 연동이 아니다). 서술·속마음 없이 ${c.name}의 문자만 1~3문장으로 쓴다.
알고 있는 사실 목록 밖의 비밀은 말하지 않는다. 유저가 하지 않은 약속·만남·대화를 기억한다고 말하지 않는다 — 기록에 있는 것만. 유저가 연락 중지를 요청했으면 짧게 받아들이고 더 붙잡지 않는다.
JSON: {"text":"..."}`
  const prompt = JSON.stringify({
    protagonist: protagonistLines(def, p),
    lines: visibleLines(def, s, c), schedule: c.schedule,
    knows: knownFacts(def, s, speaker),
    relation: relationWords(def, s, speaker),
    sharedPromises: s.promises.filter(m => m.who === speaker).map(m => m.fact),
    memory: s.memory.filter(m => m.who === speaker || m.who === 'player').slice(-8).map(m => m.fact),
    lastScenes: logText(def, scene.slice(-4), p),
    thread: logText(def, thread.slice(-12), p),
    notApplied: rejected.map(r => ({ type: r.action.type, reason: r.reason })),
    input,
  })
  return { system, prompt }
}
