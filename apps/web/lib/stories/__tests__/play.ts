import { applyActions, initialState, type StoryAction, type StoryDefinition, type StoryState } from '@miro/domain'

type ActionInput = { type: StoryAction['type']; quote?: string; [k: string]: unknown }
type Step = string | { say: string; actions: ActionInput[] }

/** 테스트용 진행기: 'E1:A' 는 선택, 그 밖엔 행동 목록. 근거(quote)는 입력 전체를 쓴다. */
export function play(def: StoryDefinition, steps: Step[], start?: StoryState) {
  let state = start ?? initialState(def)
  const log: { input: string; rejected: string[] }[] = []
  steps.forEach((step, i) => {
    // 'E2:B' 처럼 사건을 적었으면 지금 사건이 맞는지도 본다 — 다른 사건의 B 를 고르지 않게.
    if (typeof step === 'string' && step.split(':')[0] !== state.current) { log.push({ input: step, rejected: [`option:wrong_event(${state.current})`] }); return }
    const s = typeof step === 'string' ? { say: `선택 ${step}`, actions: [optionAction(step)] } : step
    const actions = s.actions.map(a => ({ ...a, quote: a.quote ?? s.say })) as StoryAction[]
    const r = applyActions(def, state, actions, s.say, `t${i}`)
    state = r.state
    log.push({ input: s.say, rejected: r.rejected.map(x => `${x.action.type}:${x.reason}`) })
  })
  return { state, log }
}

function optionAction(step: string): ActionInput {
  const [, option, pick] = step.split(':')
  return { type: 'option', option: option!, pick: pick ?? null }
}

export const all = (def: StoryDefinition, value: string) =>
  ({ say: `모두 ${value}`, actions: def.characters.map(c => ({ type: 'relation_outcome' as const, character: c.key, value })) })
