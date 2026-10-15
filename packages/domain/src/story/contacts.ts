import { evalCond } from './engine'
import type { ContactRule, StoryDefinition, StoryState } from './types'

/**
 * 연락석(선톡) 규칙. 예약은 '이유가 생겼다'는 기록일 뿐 — 실제 발송 순간에 contactGate 로 전부 다시 본다.
 * 순서(원고 공통 규칙): 수신 허용 → 시간대·휴식 → 장면 충돌 → 인물 지식·사건 조건 → 하루 한도·미읽음·간격 → 중복 키.
 */
export function rulesToSchedule(def: StoryDefinition, s: StoryState, existingKeys: Set<string>): ContactRule[] {
  return def.contacts.filter(r => !existingKeys.has(r.key) && evalCond(def, s, r.when) && !evalCond(def, s, r.cancelIf))
}

/** 이미 예약된 규칙이 지금 상태에서 취소돼야 하는가(상태가 바뀌어 문안이 맞지 않음·연락 중지). */
export function shouldCancel(def: StoryDefinition, s: StoryState, r: ContactRule): string | null {
  if (s.rel[r.speaker]?.contact === 'stopped') return 'contact_stopped'
  if (evalCond(def, s, r.cancelIf)) return 'cancel_condition'
  if (!evalCond(def, s, r.when)) return 'condition_no_longer_true'
  if (s.premise === 'refused') return 'premise_refused'
  return null
}

function minutesOf(hhmm: string): number { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0) }
export function localParts(now: Date, timeZone: string): { day: string; minutes: number } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(now).map(x => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) }
}
export function inQuiet(minutes: number, q: { start: string; end: string }): boolean {
  const a = minutesOf(q.start), b = minutesOf(q.end)
  return a <= b ? minutes >= a && minutes < b : minutes >= a || minutes < b
}

export type GateContext = {
  now: Date
  /** null = 알 수 없음 → 보류 */
  timeZone: string | null
  /** 전역 수신 허용(user_settings.push_enabled) */
  globalAllowed: boolean
  /** 사용자가 지정한 휴식 시간(있으면 작품 기본값과 함께 막는다) */
  userQuiet: { start: string; end: string } | null
  /** 마지막 유저 장면 입력 — 진행 중 장면 잠금 */
  lastSceneInputAt: Date | null
  /** 같은 작품에서 오늘(현지) 보낸 수 */
  sentToday: number
  lastSentBySpeaker: Date | null
  unreadBySpeaker: number
  keyAlreadySent: boolean
  /** nextScene 규칙: 예약 당시 장면 번호 */
  scheduledScene: number | null
}
export const SCENE_LOCK_MINUTES = 10

export type GateResult = { ok: true } | { ok: false; reason: string; cancel: boolean }

export function contactGate(def: StoryDefinition, s: StoryState, r: ContactRule, g: GateContext): GateResult {
  const hold = (reason: string): GateResult => ({ ok: false, reason, cancel: false })
  const cancel = (reason: string): GateResult => ({ ok: false, reason, cancel: true })
  if (g.keyAlreadySent) return cancel('duplicate_key')
  if (s.rel[r.speaker]?.contact === 'stopped') return cancel('contact_stopped')
  if (!g.globalAllowed || !s.contactOptIn || s.rel[r.speaker]?.contact !== 'allowed') return hold('not_permitted')
  if (!g.timeZone) return hold('timezone_unknown')
  const local = localParts(g.now, g.timeZone)
  if (inQuiet(local.minutes, def.contactPolicy.quiet) || (g.userQuiet && inQuiet(local.minutes, g.userQuiet))) return hold('quiet_hours')
  if (g.lastSceneInputAt && g.now.getTime() - g.lastSceneInputAt.getTime() < SCENE_LOCK_MINUTES * 60_000) return hold('scene_in_progress')
  const why = shouldCancel(def, s, r)
  if (why) return cancel(why)
  if ('nextScene' in r.delay && g.scheduledScene !== null && s.scene <= g.scheduledScene) return hold('waiting_next_scene')
  if (g.sentToday >= def.contactPolicy.dailyCap) return hold('daily_cap')
  if (g.unreadBySpeaker >= def.contactPolicy.unreadPerSpeaker) return hold('speaker_unread')
  if (g.lastSentBySpeaker && g.now.getTime() - g.lastSentBySpeaker.getTime() < def.contactPolicy.speakerGapHours * 3_600_000) return hold('speaker_gap')
  return { ok: true }
}

/** 예약 시각: 현실 분 지연이면 지금+분, 다음 장면형이면 지금(장면 조건은 게이트가 본다). */
export function dueAt(r: ContactRule, now: Date): Date {
  return 'realMinutes' in r.delay ? new Date(now.getTime() + r.delay.realMinutes * 60_000) : now
}
