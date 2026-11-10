import { applyActions, currentEvent, initialState, optionOpen, type StoryAction, type StoryDefinition, type StoryState } from '@miro/domain'

export type PathStep = { say: string; actions: StoryAction[] }

/**
 * 선택만으로(대화 신뢰·호감 없이) 결말까지 가는 경로를 깊이 우선으로 찾는다.
 * 결말 사건에선 진로 선택 뒤 모든 인물을 연애가 아닌 첫 관계로 정한다. 같은 사건의 머무는 선택은 한 번씩만.
 */
export function pathsToEndings(def: StoryDefinition, limit = 40): Map<string, PathStep[]> {
  const found = new Map<string, PathStep[]>()
  const calm = def.relation.outcomes.find(o => o !== def.relation.romanceOutcome)!
  // ponytail: 방문 상태 기억 + 노드 상한 — 결말 '하나 이상' 증명용이라 전수 탐색은 하지 않는다.
  const seen = new Set<string>()
  let budget = 20_000
  const walk = (s: StoryState, path: PathStep[], used: Set<string>, depth: number) => {
    if (found.size >= def.endings.length || depth > limit || --budget < 0) return
    const key = JSON.stringify([s.current, s.vars, s.rel, s.choices, [...used]])
    if (seen.has(key)) return
    seen.add(key)
    if (s.current === 'ended') { if (s.ending && !found.has(s.ending)) found.set(s.ending, path); return }
    const ev = currentEvent(def, s)!
    for (const o of ev.options) {
      const key = `${ev.id}:${o.id}`
      if (used.has(key) || !optionOpen(def, s, o).ok) continue
      const picks = o.pick ? o.pick.choices.filter(c => !(s.vars[o.pick!.add] as string[]).includes(c)) : []
      for (const pick of picks.length ? picks : [null]) {
        const say = `[${o.id}${pick ? `:${pick}` : ''}] ${o.hint}`
        const step: PathStep = { say, actions: [{ type: 'option', option: o.id, pick, quote: say }] }
        let r = applyActions(def, s, step.actions, say, `p${depth}`)
        if (r.rejected.length) continue
        const steps = [step]
        if (ev.final && r.state.current !== 'ended') {
          const rel: PathStep = { say: `모두 ${calm}`, actions: def.characters.map(c => ({ type: 'relation_outcome', character: c.key, value: calm, quote: `모두 ${calm}` })) }
          r = applyActions(def, r.state, rel.actions, rel.say, `p${depth}r`)
          steps.push(rel)
        }
        const nextUsed = r.state.current === s.current ? new Set([...used, key]) : new Set<string>()
        walk(r.state, [...path, ...steps], nextUsed, depth + 1)
      }
    }
  }
  walk(initialState(def), [], new Set(), 0)
  return found
}
