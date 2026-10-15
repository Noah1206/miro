import type { AppliedChange, Cond, Effect, Rejected, RelState, StoryAction, StoryDefinition, StoryEvent, StoryOption, StoryState, Val } from './types'

/**
 * 스토리 상태 기계. 모델은 StoryAction 을 '제안'만 한다 — 값과 효과는 여기서 정의(StoryDefinition)로만 정해진다.
 * 같은 입력이면 같은 결과(순수 함수). 중복 요청 방지는 DB(회차·턴 키)가 맡는다.
 */
export function initialState(def: StoryDefinition): StoryState {
  const vars: StoryState['vars'] = {}
  for (const [k, v] of Object.entries(def.vars)) vars[k] = v.type === 'set' ? [] : v.init
  const rel: Record<string, RelState> = {}
  const known: Record<string, string[]> = { player: [] }
  for (const c of def.characters) {
    rel[c.key] = { trust: 0, affinity: 0, contact: 'unset', boundaries: [], outcome: null }
    known[c.key] = [...c.knows]
  }
  return { current: def.events[0]!.id, completed: [], choices: {}, vars, rel, known, trustLog: [], affinityLog: [], exclusive: null,
    terms: [], memory: [], promises: [], notes: [], scene: 0, contactOptIn: false, premise: 'accepted', ending: null }
}

export function eventOf(def: StoryDefinition, id: string): StoryEvent | undefined { return def.events.find(e => e.id === id) }
export function currentEvent(def: StoryDefinition, s: StoryState): StoryEvent | undefined { return s.current === 'ended' ? undefined : eventOf(def, s.current) }

function sizeOf(v: unknown): number { return Array.isArray(v) ? v.length : 0 }

export function evalCond(def: StoryDefinition, s: StoryState, c: Cond, bind: Record<string, string> = {}): boolean {
  const who = (k: string) => (k.startsWith('$') ? bind[k.slice(1)] ?? k : k)
  if ('all' in c) return c.all.every(x => evalCond(def, s, x, bind))
  if ('any' in c) return c.any.some(x => evalCond(def, s, x, bind))
  if ('not' in c) return !evalCond(def, s, c.not, bind)
  if ('var' in c) {
    const v = s.vars[c.var]
    if (c.eq !== undefined && v !== c.eq) return false
    if (c.gte !== undefined && !(typeof v === 'number' && v >= c.gte)) return false
    if (c.lte !== undefined && !(typeof v === 'number' && v <= c.lte)) return false
    if (c.has !== undefined && !(Array.isArray(v) && v.includes(c.has))) return false
    if (c.sizeGte !== undefined && sizeOf(v) < c.sizeGte) return false
    if (c.sizeLt !== undefined && sizeOf(v) >= c.sizeLt) return false
    return true
  }
  if ('rel' in c) {
    const r = s.rel[who(c.rel)]
    if (!r) return false
    if (c.trustGte !== undefined && r.trust < c.trustGte) return false
    if (c.affinityGte !== undefined && r.affinity < c.affinityGte) return false
    if (c.contact !== undefined && r.contact !== c.contact) return false
    if (c.relation !== undefined && r.outcome !== c.relation) return false
    return true
  }
  if ('done' in c) return s.completed.includes(c.done)
  if ('current' in c) return s.current === c.current
  if ('chose' in c) return s.choices[c.chose] === c.option
  if ('knows' in c) return (s.known[who(c.knows)] ?? []).includes(c.fact)
  if ('exclusiveOther' in c) return s.exclusive !== null && s.exclusive !== who(c.exclusiveOther)
  return false
}

export function optionOpen(def: StoryDefinition, s: StoryState, o: StoryOption): { ok: boolean; reason?: string } {
  if (o.requires && !evalCond(def, s, o.requires)) return { ok: false, reason: o.unmet ?? 'requirements_unmet' }
  return { ok: true }
}

const clone = (s: StoryState): StoryState => JSON.parse(JSON.stringify(s)) as StoryState
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()
/** 유저가 실제로 한 말인가 — 해석기가 지어낸 근거를 막는다. */
export function quoted(input: string, quote: string): boolean {
  const q = norm(quote)
  return q.length >= 1 && norm(input).includes(q)
}

function trustUp(def: StoryDefinition, s: StoryState, eventId: string, char: string, out: AppliedChange[], cause: string): boolean {
  const key = `${eventId}:${char}`
  const r = s.rel[char]
  if (!r || s.trustLog.includes(key) || r.trust >= def.relation.trustMax) return false
  r.trust += 1
  s.trustLog.push(key)
  out.push({ kind: 'trust', detail: { character: char, to: r.trust, event: eventId, cause } })
  return true
}

function applyEffect(def: StoryDefinition, s: StoryState, e: Effect, eventId: string, out: AppliedChange[], cause: string) {
  if ('set' in e) {
    if (s.vars[e.set] === e.value) return
    s.vars[e.set] = e.value
    out.push({ kind: 'var', detail: { key: e.set, to: e.value, cause } })
  } else if ('inc' in e) {
    const d = def.vars[e.inc]
    if (d?.type !== 'int') return
    const before = s.vars[e.inc] as number
    const after = Math.max(d.min, Math.min(d.max, before + e.by))
    if (after === before) return
    s.vars[e.inc] = after
    out.push({ kind: 'var', detail: { key: e.inc, from: before, to: after, cause } })
  } else if ('add' in e) {
    const d = def.vars[e.add]
    const list = s.vars[e.add] as string[]
    if (d?.type !== 'set' || !d.values.includes(e.value) || list.includes(e.value)) return
    list.push(e.value)
    out.push({ kind: 'set_add', detail: { key: e.add, value: e.value, cause } })
  } else if ('trust' in e) {
    if ((e.by ?? 1) > 0) trustUp(def, s, eventId, e.trust, out, cause)
    else {
      const r = s.rel[e.trust]
      if (!r || r.trust === 0) return
      r.trust = Math.max(0, r.trust + (e.by ?? 0))
      out.push({ kind: 'trust', detail: { character: e.trust, to: r.trust, event: eventId, cause } })
    }
  } else if ('affinity' in e) {
    const r = s.rel[e.affinity]
    if (!r) return
    if ((e.by ?? 1) > 0) {
      const key = `${eventId}:${e.affinity}`
      if (s.affinityLog.includes(key) || r.affinity >= def.relation.affinityMax) return
      r.affinity += 1; s.affinityLog.push(key)
    } else {
      if (r.affinity === 0) return
      r.affinity = Math.max(0, r.affinity + (e.by ?? 0))
    }
    out.push({ kind: 'affinity', detail: { character: e.affinity, to: r.affinity, cause } })
  } else if ('if' in e) {
    for (const x of evalCond(def, s, e.if) ? e.then : e.else ?? []) applyEffect(def, s, x, eventId, out, cause)
  } else if ('reveal' in e) {
    for (const who of e.to) {
      const list = (s.known[who] ??= [])
      if (!list.includes(e.reveal)) { list.push(e.reveal); out.push({ kind: 'reveal', detail: { fact: e.reveal, to: who, cause } }) }
    }
  } else if ('note' in e) {
    s.notes.push(`${eventId}: ${e.note}`)
    out.push({ kind: 'note', detail: { text: e.note, cause } })
  }
}

function complete(def: StoryDefinition, s: StoryState, ev: StoryEvent, out: AppliedChange[], cause: string) {
  for (const e of ev.always ?? []) applyEffect(def, s, e, ev.id, out, cause)
  if (!s.completed.includes(ev.id)) s.completed.push(ev.id)
  s.scene += 1
  if (ev.final) {
    s.ending = endingFor(def, s)?.id ?? null
    s.current = 'ended'
  } else s.current = ev.next ?? 'ended'
  out.push({ kind: 'event_complete', detail: { event: ev.id, next: s.current, ending: s.ending, cause } })
}

/** 결말 사건은 진로와 인물별 관계 선택이 모두 끝나면 닫힌다. */
function finalReady(def: StoryDefinition, s: StoryState): boolean {
  const o = s.vars[def.relation.outcomeVar]
  return typeof o === 'string' && o !== 'unset' && def.characters.every(c => s.rel[c.key]!.outcome !== null)
}

export function romanceOpen(def: StoryDefinition, s: StoryState, char: string): boolean {
  return def.relation.romanceGate.every(c => evalCond(def, s, c, { c: char })) && s.rel[char]?.contact !== 'stopped' && !(s.exclusive && s.exclusive !== char)
}

export function endingFor(def: StoryDefinition, s: StoryState) { return def.endings.find(e => evalCond(def, s, e.when)) ?? null }

export type ApplyResult = { state: StoryState; applied: AppliedChange[]; rejected: Rejected[]; completed: string | null }

/**
 * 제안된 행동을 검증해 적용한다. 거부는 이유와 함께 돌려준다(장면에서 설명하거나 확인 질문으로).
 * cause = 원인이 된 메시지/턴 id — 모든 변경에 붙는다.
 */
export function applyActions(def: StoryDefinition, prev: StoryState, actions: StoryAction[], input: string, cause: string): ApplyResult {
  const s = clone(prev)
  const applied: AppliedChange[] = []
  const rejected: Rejected[] = []
  let completed: string | null = null
  const reject = (action: StoryAction, reason: string) => { rejected.push({ action, reason }) }
  const chars = new Set(def.characters.map(c => c.key))

  for (const a of actions) {
    if (!quoted(input, a.quote)) { reject(a, 'quote_not_in_input'); continue }
    if (s.current === 'ended' && !['memory', 'promise', 'contact', 'boundary', 'time_skip'].includes(a.type)) { reject(a, 'season_ended'); continue }
    if (s.premise === 'refused' && a.type !== 'accept_premise' && a.type !== 'contact') { reject(a, 'premise_refused'); continue }
    const ev = currentEvent(def, s)
    if ('character' in a && a.character !== null && !chars.has(a.character)) { reject(a, 'unknown_character'); continue }

    switch (a.type) {
      case 'refuse_premise': s.premise = 'refused'; applied.push({ kind: 'premise', detail: { to: 'refused', cause } }); break
      case 'accept_premise':
        if (s.premise === 'accepted') { reject(a, 'already_accepted'); break }
        s.premise = 'accepted'; applied.push({ kind: 'premise', detail: { to: 'accepted', cause } }); break
      case 'option': {
        if (!ev) { reject(a, 'no_current_event'); break }
        if (completed) { reject(a, 'one_completion_per_turn'); break }
        const o = ev.options.find(x => x.id === a.option)
        if (!o) { reject(a, 'option_not_in_current_event'); break }
        const open = optionOpen(def, s, o)
        if (!open.ok) { reject(a, open.reason!); break }
        if (o.pick) {
          const have = s.vars[o.pick.add] as string[]
          const missing = o.pick.choices.filter(x => !have.includes(x))
          if (missing.length) {
            if (!a.pick || !missing.includes(a.pick)) { reject(a, 'pick_required'); break }
            applyEffect(def, s, { add: o.pick.add, value: a.pick }, ev.id, applied, cause)
            const fact = o.pick.reveal?.[a.pick]
            if (fact) applyEffect(def, s, { reveal: fact, to: ['player'] }, ev.id, applied, cause)
          }
        }
        for (const e of o.effects) applyEffect(def, s, e, ev.id, applied, cause)
        if (o.outcome) applyEffect(def, s, { set: def.relation.outcomeVar, value: o.outcome }, ev.id, applied, cause)
        s.choices[ev.id] = o.id
        applied.push({ kind: 'choice', detail: { event: ev.id, option: o.id, cause } })
        if (ev.final) { if (finalReady(def, s)) { complete(def, s, ev, applied, cause); completed = ev.id } }
        else if (o.completes !== false) { complete(def, s, ev, applied, cause); completed = ev.id }
        break
      }
      case 'trust': {
        const evId = completed ?? ev?.id
        const allowed = completed ? eventOf(def, completed)?.conversationTrust : ev?.conversationTrust
        if (!evId || !allowed?.includes(a.character)) { reject(a, 'trust_not_open_in_event'); break }
        if (!trustUp(def, s, evId, a.character, applied, cause)) reject(a, 'trust_capped')
        break
      }
      case 'affinity': {
        const evId = completed ?? ev?.id ?? 'season'
        const key = `${evId}:${a.character}`
        const r = s.rel[a.character]!
        if (s.affinityLog.includes(key) || r.affinity >= def.relation.affinityMax) { reject(a, 'affinity_capped'); break }
        r.affinity += 1; s.affinityLog.push(key)
        applied.push({ kind: 'affinity', detail: { character: a.character, to: r.affinity, cause } })
        break
      }
      case 'contact': {
        const r = s.rel[a.character]!
        if (r.contact === a.value) { reject(a, 'no_change'); break }
        r.contact = a.value
        if (a.value === 'allowed') s.contactOptIn = true
        applied.push({ kind: 'contact', detail: { character: a.character, to: a.value, cause } })
        break
      }
      case 'boundary': {
        const r = s.rel[a.character]!
        const v = a.value.slice(0, 80)
        if (!v || r.boundaries.includes(v) || r.boundaries.length >= 10) { reject(a, 'boundary_invalid'); break }
        r.boundaries.push(v)
        applied.push({ kind: 'boundary', detail: { character: a.character, value: v, cause } })
        break
      }
      case 'relation_outcome': {
        if (!ev?.final) { reject(a, 'relation_choice_only_in_finale'); break }
        if (!def.relation.outcomes.includes(a.value)) { reject(a, 'invalid_relation_outcome'); break }
        if (a.value === def.relation.romanceOutcome && !romanceOpen(def, s, a.character)) { reject(a, 'romance_gate_unmet'); break }
        s.rel[a.character]!.outcome = a.value
        applied.push({ kind: 'relation_outcome', detail: { character: a.character, to: a.value, cause } })
        if (!completed && finalReady(def, s)) { complete(def, s, ev, applied, cause); completed = ev.id }
        break
      }
      case 'exclusive': {
        if (a.character && s.rel[a.character]?.contact === 'stopped') { reject(a, 'contact_stopped'); break }
        if (s.exclusive === a.character) { reject(a, 'no_change'); break }
        s.exclusive = a.character
        applied.push({ kind: 'exclusive', detail: { to: a.character, cause } })
        break
      }
      case 'memory': case 'promise': {
        const v = a.value.trim().slice(0, 200)
        const list = a.type === 'memory' ? s.memory : s.promises
        if (!v || list.some(m => m.fact === v)) { reject(a, 'duplicate_or_empty'); break }
        list.push({ id: `${cause}:${list.length}`, eventId: ev?.id ?? null, who: a.character ?? 'player', fact: v, quote: a.quote.slice(0, 200), source: cause })
        applied.push({ kind: a.type, detail: { who: a.character ?? 'player', value: v, cause } })
        break
      }
      case 'time_skip': {
        s.scene += 1
        applied.push({ kind: 'time_skip', detail: { scene: s.scene, cause } })
        break
      }
    }
  }
  return { state: s, applied, rejected, completed }
}

/** 정의 무결성 — 시드·테스트에서 부른다. 문제 목록(빈 배열이면 통과). */
export function validateDefinition(def: StoryDefinition): string[] {
  const errs: string[] = []
  const chars = new Set(def.characters.map(c => c.key))
  const evs = new Set(def.events.map(e => e.id))
  const facts = new Set(Object.keys(def.facts))
  const checkCond = (c: Cond, at: string): void => {
    if ('all' in c) return c.all.forEach(x => checkCond(x, at))
    if ('any' in c) return c.any.forEach(x => checkCond(x, at))
    if ('not' in c) return checkCond(c.not, at)
    if ('var' in c && !def.vars[c.var]) errs.push(`${at}: unknown var ${c.var}`)
    if ('rel' in c && !c.rel.startsWith('$') && !chars.has(c.rel)) errs.push(`${at}: unknown char ${c.rel}`)
    if ('done' in c && !evs.has(c.done)) errs.push(`${at}: unknown event ${c.done}`)
    if ('current' in c && !evs.has(c.current)) errs.push(`${at}: unknown event ${c.current}`)
    if ('chose' in c && !evs.has(c.chose)) errs.push(`${at}: unknown event ${c.chose}`)
    if ('knows' in c && !facts.has(c.fact)) errs.push(`${at}: unknown fact ${c.fact}`)
  }
  const checkEffect = (e: Effect, at: string): void => {
    const key = 'set' in e ? e.set : 'inc' in e ? e.inc : 'add' in e ? e.add : null
    if (key && !def.vars[key]) errs.push(`${at}: unknown var ${key}`)
    if ('add' in e) { const d = def.vars[e.add]; if (d?.type === 'set' && !d.values.includes(e.value)) errs.push(`${at}: bad set value ${e.value}`) }
    if ('trust' in e && !chars.has(e.trust)) errs.push(`${at}: unknown char ${e.trust}`)
    if ('affinity' in e && !chars.has(e.affinity)) errs.push(`${at}: unknown char ${e.affinity}`)
    if ('if' in e) { checkCond(e.if, at); e.then.forEach((x, i) => checkEffect(x, `${at}.then${i}`)); e.else?.forEach((x, i) => checkEffect(x, `${at}.else${i}`)) }
    if ('reveal' in e) {
      if (!facts.has(e.reveal)) errs.push(`${at}: unknown fact ${e.reveal}`)
      for (const w of e.to) if (w !== 'player' && !chars.has(w)) errs.push(`${at}: unknown reveal target ${w}`)
    }
  }
  for (const c of def.characters) {
    for (const f of c.knows) if (!facts.has(f)) errs.push(`${c.key}: unknown fact ${f}`)
    for (const [k, g] of Object.entries(c.lineGates ?? {})) if (g) checkCond(g, `${c.key}.lineGates.${k}`)
  }
  if (!def.vars[def.relation.outcomeVar]) errs.push('relation.outcomeVar missing')
  def.relation.romanceGate.forEach((c, i) => checkCond(c, `romanceGate${i}`))
  for (const ev of def.events) {
    if (ev.next && !evs.has(ev.next)) errs.push(`${ev.id}: bad next ${ev.next}`)
    for (const c of ev.cast) if (!chars.has(c)) errs.push(`${ev.id}: unknown cast ${c}`)
    for (const c of ev.conversationTrust ?? []) if (!chars.has(c)) errs.push(`${ev.id}: unknown trust char ${c}`)
    ev.always?.forEach((e, i) => checkEffect(e, `${ev.id}.always${i}`))
    const ids = new Set<string>()
    for (const o of ev.options) {
      if (ids.has(o.id)) errs.push(`${ev.id}: dup option ${o.id}`)
      ids.add(o.id)
      if (o.requires) checkCond(o.requires, `${ev.id}.${o.id}`)
      o.effects.forEach((e, i) => checkEffect(e, `${ev.id}.${o.id}.${i}`))
      if (o.pick && def.vars[o.pick.add]?.type !== 'set') errs.push(`${ev.id}.${o.id}: pick var not set`)
      if (o.outcome && ev.final) { const d = def.vars[def.relation.outcomeVar]; if (d?.type === 'enum' && !d.values.includes(o.outcome)) errs.push(`${ev.id}.${o.id}: bad outcome`) }
    }
  }
  if (!def.events.some(e => e.final)) errs.push('no final event')
  for (const e of def.endings) checkCond(e.when, `ending ${e.id}`)
  const keys = new Set<string>()
  for (const r of def.contacts) {
    if (!chars.has(r.speaker)) errs.push(`${r.id}: unknown speaker`)
    if (keys.has(r.key)) errs.push(`${r.id}: dup key`)
    keys.add(r.key)
    checkCond(r.when, `${r.id}.when`); checkCond(r.cancelIf, `${r.id}.cancelIf`)
  }
  return errs
}

export function varValue(s: StoryState, key: string): Val | string[] | undefined { return s.vars[key] }
