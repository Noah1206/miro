import { minutesOf, type LocalClock } from '../time/clock'

/**
 * 캐릭터의 생활 리듬. "지금 연락이 닿는가" 를 이것으로 판단한다 — 선연락, 통화 응답, 답장 지연이 모두 여기서 갈린다.
 * 일상적인 사람이 아닐 수도 있다(밤에 움직이는 존재, 군인, 왕족). 그래서 블록은 캐릭터 설정에서 만들고, 여기서는 읽기만 한다.
 */
export type Availability = 'free' | 'busy' | 'unreachable'

export type RoutineBlock = {
  /** 0=일 … 6=토. 비어 있으면 매일. */
  days: number[]
  /** 'HH:MM'. end < start 면 자정을 넘는다(23:00~07:00). */
  start: string
  end: string
  /** 캐릭터 말로 된 이름 — '야간 순찰', '수업', '자는 중'. 화면과 프롬프트에 그대로 쓴다. */
  label: string
  /** busy = 짧게는 되지만 긴 연락은 못 함(전화 못 받음), unreachable = 아예 닿지 않음(수면·이동·차단). */
  availability: Availability
}

export type Routine = {
  version: 1
  source: 'generated' | 'default' | 'authored'
  blocks: RoutineBlock[]
  /** 캐릭터가 왜 이런 리듬인지 한 줄 — 프롬프트에 실린다. */
  note: string | null
  generatedAt: string
}

export const ROUTINE_MAX_BLOCKS = 14

export type AvailabilityNow = {
  availability: Availability
  /** 지금 걸린 블록의 이름. free 면 null. */
  label: string | null
  /** 지금 블록이 끝날 때까지 남은 분. free 면 null. 바로 이어지는 다음 블록까지는 보지 않는다(ponytail: 다음 블록이 이어질 수 있음). */
  minutesUntilFree: number | null
}

const RANK: Record<Availability, number> = { free: 0, busy: 1, unreachable: 2 }

/** 모델 출력이나 저장된 JSON 을 검증한다. 하나라도 이상하면 null — 반쯤 맞는 리듬으로 캐릭터를 움직이지 않는다. */
export function parseRoutine(raw: unknown, source: Routine['source'], generatedAt: string): Routine | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { blocks?: unknown; note?: unknown }
  if (!Array.isArray(r.blocks) || r.blocks.length === 0 || r.blocks.length > ROUTINE_MAX_BLOCKS) return null
  const blocks: RoutineBlock[] = []
  for (const b of r.blocks as Array<Record<string, unknown>>) {
    if (!b || typeof b !== 'object') return null
    const days = Array.isArray(b.days) ? b.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : []
    if (Array.isArray(b.days) && days.length !== b.days.length) return null
    const start = String(b.start ?? ''), end = String(b.end ?? '')
    if (minutesOf(start) === null || minutesOf(end) === null || start === end) return null
    const label = String(b.label ?? '').trim().slice(0, 30)
    if (!label) return null
    const availability = b.availability
    if (availability !== 'free' && availability !== 'busy' && availability !== 'unreachable') return null
    blocks.push({ days, start, end, label, availability })
  }
  return { version: 1, source, blocks, note: typeof r.note === 'string' && r.note.trim() ? r.note.trim().slice(0, 200) : null, generatedAt }
}

/**
 * 제작자가 적은 활동 시간을 리듬이 읽을 수 있는 값으로. '24:00' 은 자정(00:00), 읽을 수 없으면 08:00~23:00.
 * 결과가 하루 종일(시작=끝)이면 null — 잠드는 시간이 없는 캐릭터다.
 */
export function normalizeActiveHours(h: { start: string; end: string }): { start: string; end: string } | null {
  const fix = (v: string) => (v === '24:00' ? '00:00' : v)
  let start = fix(h.start), end = fix(h.end)
  if (minutesOf(start) === null || minutesOf(end) === null) { start = '08:00'; end = '23:00' }
  return start === end ? null : { start, end }
}

/** 리듬이 없을 때 — 활동 시간 밖은 자는 것으로 본다. 예전 '08~23시' 규칙과 같은 결과다. 언제나 parseRoutine 을 통과한다. */
export function defaultRoutine(activeHours: { start: string; end: string }, generatedAt: string): Routine {
  const h = normalizeActiveHours(activeHours)
  return { version: 1, source: 'default', note: null, generatedAt,
    blocks: h ? [{ days: [], start: h.end, end: h.start, label: '자는 중', availability: 'unreachable' }]
      : [{ days: [], start: '00:00', end: '23:59', label: '깨어 있음', availability: 'free' }] }
}

/** 지금 이 순간의 상태. 겹치면 더 닿기 어려운 쪽이 이긴다. */
export function availabilityAt(routine: Routine | null, clock: LocalClock): AvailabilityNow {
  if (!routine) return { availability: 'free', label: null, minutesUntilFree: null }
  const mins = clock.hour * 60 + clock.minute
  let hit: { block: RoutineBlock; left: number } | null = null
  for (const block of routine.blocks) {
    const s = minutesOf(block.start)!, e = minutesOf(block.end)!
    const onDay = (d: number) => block.days.length === 0 || block.days.includes(d)
    let left: number | null = null
    if (s < e) { if (onDay(clock.weekday) && mins >= s && mins < e) left = e - mins }
    else {
      // 자정을 넘는 블록: 오늘 시작해서 아직이거나, 어제 시작해서 아직 안 끝났거나.
      if (onDay(clock.weekday) && mins >= s) left = 1440 - mins + e
      else if (onDay((clock.weekday + 6) % 7) && mins < e) left = e - mins
    }
    if (left === null) continue
    if (!hit || RANK[block.availability] > RANK[hit.block.availability]) hit = { block, left }
  }
  if (!hit || hit.block.availability === 'free') return { availability: 'free', label: hit?.block.label ?? null, minutesUntilFree: null }
  return { availability: hit.block.availability, label: hit.block.label, minutesUntilFree: hit.left }
}

/** 프롬프트용 한 줄. 캐릭터가 자기 하루를 안다. */
export function describeRoutine(routine: Routine | null, now: AvailabilityNow): string | null {
  if (!routine) return null
  const parts = [now.availability === 'free' ? '지금은 시간이 비어 있다' : `지금은 '${now.label}' 중(${now.availability === 'busy' ? '짧게만 가능' : '연락이 닿지 않음'})`]
  if (routine.note) parts.push(routine.note)
  return parts.join('. ')
}
