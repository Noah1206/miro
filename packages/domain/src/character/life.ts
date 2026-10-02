import { POLICY } from '@miro/config'
import { availabilityAt, type Routine } from '../reality/routine'
import { localClock, localIso } from '../time/clock'
import type { AgencyEvidence } from './agency/types'

/**
 * 캐릭터의 '자기 삶'(2026-10-02 사용자 결정 — "대화가 시작되면 성격·가치관·세계관을 가진, 자유의지 있는 한 사람").
 * 사람은 연락이 없는 동안에도 하루를 살고, 다음에 만나면 그 얘기를 한다. 모델은 지난 시간에 있었을 법한 일을 제안하고,
 * 서버는 시간·종류·길이를 거른 것만 남긴다. 남은 일은 캐릭터 본인의 경험(근거)이 되어 기분·대화·먼저 연락이 읽는다 —
 * 세계 상태·관계 수치는 바꾸지 않는다(그건 사용자와 함께한 일이 정한다).
 */
export const LIFE_EVENT_KINDS = ['work', 'errand', 'social', 'hobby', 'rest', 'incident', 'thought'] as const
export type LifeEventKind = (typeof LIFE_EVENT_KINDS)[number]
export type LifeEvent = {
  id: string
  /** 실제 시각(ISO). */
  occurredAt: string
  /** 그때의 생활 리듬 블록 이름('근무', '운동') — 서버가 리듬에서 읽는다. */
  block: string
  kind: LifeEventKind
  /** 캐릭터 입장의 과거형 한 문장(내부 기록, 이름 없이). */
  summary: string
  /** 기분에 준 영향 -1..1, 마음에 남은 정도 0..1. */
  valence: number
  intensity: number
  /** 이 사람이 사용자에게 이야기하고 싶어 할 만한 일 — 먼저 연락할 이유가 될 수 있다. */
  shareable: boolean
}
export type LifeEventDraft = Omit<LifeEvent, 'id'>
export type LifeProposal = { at: string; kind: string; summary: string; valence: number; intensity: number; shareable: boolean }
export type LifeWindow = { from: Date; to: Date; awake: string[] }

/** 자는 블록 — 이 시간에는 아무 일도 만들지 않는다. '이동'처럼 닿지 않을 뿐 깨어 있는 블록은 산다. */
const SLEEP = /수면|잠|취침|sleep/i
const HALF_HOUR = 30 * 60_000
const blockAt = (routine: Routine | null, at: Date, timeZone: string) => availabilityAt(routine, localClock(at, timeZone)).label ?? '쉬는 시간'

/**
 * 지금 되짚을 시간: 마지막으로 산 시점(또는 마지막 대화)부터 지금까지. 대화 중이던 시간은 함께 있던 시간이라 빼고, 오래 비운 방은 최근 하루만.
 * stepHours 가 안 지났거나 activeDays 넘게 오지 않은 방이면 null — 모델을 부르지 않는다.
 * awake 는 그 사이 깨어 있던 블록 이름들. 비어 있으면 잔 시간이라 일을 만들지 않고 넘긴다.
 */
export function lifeWindow(input: { lifeUntil: Date | null; lastInteractionAt: Date; now: Date; routine: Routine | null; timeZone: string }): LifeWindow | null {
  const { stepHours, maxWindowHours, activeDays } = POLICY.life
  const now = input.now.getTime()
  if (now - input.lastInteractionAt.getTime() > activeDays * 86_400_000) return null
  const from = Math.max(input.lifeUntil?.getTime() ?? 0, input.lastInteractionAt.getTime(), now - maxWindowHours * 3_600_000)
  if (now - from < stepHours * 3_600_000) return null
  const awake = new Set<string>()
  for (let t = from; t < now; t += HALF_HOUR) {
    const label = blockAt(input.routine, new Date(t), input.timeZone)
    if (!SLEEP.test(label)) awake.add(label)
  }
  return { from: new Date(from), to: input.now, awake: [...awake] }
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/**
 * 모델이 제안한 일 중 서버가 받아들이는 것: 그 시간 안이고 깨어 있던 때, 정해진 종류, 짧은 한 문장, 이미 있던 일의 반복이 아닌 것.
 * 블록 이름은 모델 말이 아니라 리듬에서 읽는다. 시간순으로 돌려준다.
 */
export function acceptLifeEvents(proposed: readonly LifeProposal[], window: LifeWindow, recent: readonly string[], routine: Routine | null, timeZone: string): LifeEventDraft[] {
  const seen = new Set(recent.map(norm))
  const out: LifeEventDraft[] = []
  for (const e of proposed) {
    if (out.length >= POLICY.life.maxEvents) break
    const t = Date.parse(e.at), summary = e.summary.trim()
    if (!Number.isFinite(t) || t <= window.from.getTime() || t > window.to.getTime()) continue
    const block = blockAt(routine, new Date(t), timeZone)
    if (SLEEP.test(block) || !(LIFE_EVENT_KINDS as readonly string[]).includes(e.kind) || !summary || summary.length > 160) continue
    if (!(e.valence >= -1 && e.valence <= 1) || !(e.intensity >= 0 && e.intensity <= 1) || seen.has(norm(summary))) continue
    seen.add(norm(summary))
    out.push({ occurredAt: new Date(t).toISOString(), block, kind: e.kind as LifeEventKind, summary, valence: e.valence, intensity: e.intensity, shareable: e.shareable === true })
  }
  return out.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
}

/** 대화 맥락의 한 줄씩 — 언제(사용자 현지)·어느 때·무슨 일. */
export function lifeLines(events: readonly LifeEvent[], timeZone: string): string[] {
  return events.map(e => `${localClock(new Date(e.occurredAt), timeZone).label} · ${e.block} · ${e.summary}`)
}

/** 자율성 판단의 근거로 — 캐릭터 본인이 직접 겪은 일(observed). 사용자는 아직 모른다(knownTo 는 캐릭터뿐). */
export function lifeEvidence(events: readonly LifeEvent[], sessionId: string, actor: string, timeZone: string): AgencyEvidence[] {
  return events.map(e => ({ sessionId, id: `life:${e.id}`, quote: `${e.block} 중: ${e.summary}`, actor,
    occurredAt: localIso(new Date(e.occurredAt), timeZone), kind: 'event', epistemic: 'observed', knownTo: [actor], shareable: e.shareable }))
}
