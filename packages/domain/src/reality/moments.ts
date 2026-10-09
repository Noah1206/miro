import { localClock, localIso } from '../time/clock'
import type { RealityIntent } from './types'

/**
 * 사용자가 말한 자기 일정(2026-10-09 — "내 말을 기억하고 챙긴다"). "금요일에 면접 있어" 를 들은 사람은
 * 전날 밤 "내일 잘해" 를 보내고, 끝날 즈음 "어땠어?" 를 먼저 묻는다. 모델은 일정을 제안만 하고, 시각 계산·거르기·연락 때는 여기서 정한다.
 */
export type UserMoment = {
  id: string
  about: string
  eventAt: Date
  hasTime: boolean
  cheerAt: Date | null
  askAt: Date
  cheeredAt: Date | null
  askedAt: Date | null
}
export type MomentPhase = 'before' | 'after'
export type MomentProposal = { about: string; date: string; time: string; weight: number }
export type MomentDraft = { about: string; eventAt: Date; hasTime: boolean; cheerAt: Date | null; askAt: Date }

/**
 * 앞으로의 일을 말했을 법한 문장 — 이것이 걸릴 때만 일정 추출 모델을 부른다(비용). 놓치는 것보다 헛부르는 쪽이 싸다.
 * 한국어·영어·일본어·중국어(앱이 고르는 네 언어).
 */
const HINT = /내일|모레|글피|이따|오늘\s*(아침|오전|점심|오후|저녁|밤)|이번\s*주|다음\s*주|담주|주말|[월화수목금토일]요일|\d+\s*시|\d+\s*일|\d+\s*\/\s*\d+|시험|면접|발표|미팅|회의|병원|진료|수술|여행|출장|생일|데이트|소개팅|공연|경기|대회|마감|오디션|결혼식|이사|입사|첫\s*출근|tomorrow|tonight|next\s+week|this\s+(week|weekend)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|exam|interview|appointment|presentation|明日|明後日|来週|週末|試験|面接|明天|后天|下周|周末|考试|面试/i
export function momentHint(text: string): boolean {
  return HINT.test(text)
}

/** 일정으로 남길 만큼 사용자에게 중요한 일(모델이 매긴 0..1). '내일 장 봐야지' 같은 건 남기지 않는다. */
const MIN_WEIGHT = 0.4
/** 이만큼 먼 일정은 받지 않는다 — 대화가 그때까지 이어질지 모르고, 오래 쥐고 있으면 엉뚱한 때 꺼낸다. */
const MAX_AHEAD_DAYS = 45
/** 같은 일을 다시 말한 것으로 볼 시간 차. */
const SAME_EVENT_HOURS = 36
/** 끝난 뒤 묻기는 이만큼 늦어지면 접는다 — 이틀 뒤 "어땠어?" 는 기억한 게 아니라 늦은 것이다. */
export const MOMENT_ASK_WINDOW_HOURS = 14

/** 사용자 현지 날짜의 하루 기준 몇 분 — 기준 날짜(base)의 현지 날짜에서 dayShift 만큼 옮긴 날. 오프셋은 그날의 것을 쓴다. */
function atLocal(base: Date, timeZone: string, dayShift: number, minutes: number): Date {
  return fromLocal(localIso(base, timeZone).slice(0, 10), dayShift, minutes, timeZone, base)
}
function fromLocal(date: string, dayShift: number, minutes: number, timeZone: string, ref: Date): Date {
  const iso = localIso(ref, timeZone)
  const sign = iso[23] === '-' ? -1 : 1
  const offset = sign * (Number(iso.slice(24, 26)) * 60 + Number(iso.slice(27, 29)))
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + dayShift, 0, minutes) - offset * 60_000)
}
const hhmm = (t: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * 언제 챙길지. 응원은 아침 일정·하루 종일인 일이면 전날 밤 9시 반(놓쳤으면 당일 아침), 오후 일정이면 세 시간 전(아침 8시 반보다 이르지 않게).
 * 묻기는 시각이 있으면 두 시간 뒤(밤 11시를 넘기면 다음 날 아침 8시 반), 하루 종일이면 그날 저녁 7시 반.
 * 응원이 지금보다 20분 안쪽이거나 일정 30분 전보다 늦으면 응원은 없다.
 */
export function momentSchedule(eventAt: Date, hasTime: boolean, timeZone: string, now: Date): { cheerAt: Date | null; askAt: Date } {
  const hour = localClock(eventAt, timeZone).hour
  const candidates = !hasTime ? [atLocal(eventAt, timeZone, -1, 21 * 60 + 30), atLocal(eventAt, timeZone, 0, 8 * 60 + 30)]
    : hour < 12 ? [atLocal(eventAt, timeZone, -1, 21 * 60 + 30), new Date(eventAt.getTime() - 90 * 60_000)]
    : [new Date(Math.max(atLocal(eventAt, timeZone, 0, 8 * 60 + 30).getTime(), eventAt.getTime() - 3 * 3_600_000))]
  const cheerAt = candidates.find(at => at.getTime() > now.getTime() + 20 * 60_000 && at.getTime() < eventAt.getTime() - 30 * 60_000
    && localClock(at, timeZone).hour >= 7) ?? null
  let askAt: Date
  if (!hasTime) askAt = atLocal(eventAt, timeZone, 0, 19 * 60 + 30)
  else {
    const after = new Date(eventAt.getTime() + 2 * 3_600_000)
    const h = localClock(after, timeZone).hour
    askAt = h >= 23 ? atLocal(after, timeZone, 1, 8 * 60 + 30) : h < 7 ? atLocal(after, timeZone, 0, 8 * 60 + 30) : after
  }
  return { cheerAt, askAt }
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

/**
 * 모델이 제안한 일정 중 서버가 받아들이는 것: 날짜·시각이 읽히고, 지금부터 45일 안의 앞날이고, 중요한 일이고, 이미 있는 같은 일이 아닌 것.
 * 시각이 없으면 그날 정오로 둔다(하루 종일인 일).
 */
export function acceptMoments(proposed: readonly MomentProposal[], now: Date, timeZone: string,
  existing: ReadonlyArray<Pick<UserMoment, 'about' | 'eventAt'>>): MomentDraft[] {
  const out: MomentDraft[] = []
  for (const p of proposed) {
    const about = p.about.trim().slice(0, 60)
    if (!about || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !(p.weight >= MIN_WEIGHT)) continue
    const minutes = p.time.trim() ? hhmm(p.time) : null
    if (p.time.trim() && minutes === null) continue
    const eventAt = fromLocal(p.date, 0, minutes ?? 12 * 60, timeZone, now)
    if (!Number.isFinite(eventAt.getTime())) continue
    const t = eventAt.getTime()
    if (t < now.getTime() - 30 * 60_000 || t > now.getTime() + MAX_AHEAD_DAYS * 86_400_000) continue
    const same = (m: Pick<UserMoment, 'about' | 'eventAt'>) => norm(m.about) === norm(about) && Math.abs(m.eventAt.getTime() - t) < SAME_EVENT_HOURS * 3_600_000
    if (existing.some(same) || out.some(same)) continue
    out.push({ about, eventAt, hasTime: minutes !== null, ...momentSchedule(eventAt, minutes !== null, timeZone, now) })
  }
  return out
}

/** 지금 챙길 일정 하나. 끝난 뒤 묻기가 먼저다(응원 때를 놓쳤으면 응원은 건너뛴다). */
export function dueMoment(moments: readonly UserMoment[], now: Date): { moment: UserMoment; phase: MomentPhase } | null {
  const t = now.getTime()
  const after = moments.filter(m => !m.askedAt && m.askAt.getTime() <= t && t - m.askAt.getTime() < MOMENT_ASK_WINDOW_HOURS * 3_600_000)
    .sort((a, b) => a.askAt.getTime() - b.askAt.getTime())[0]
  if (after) return { moment: after, phase: 'after' }
  const before = moments.filter(m => m.cheerAt && !m.cheeredAt && m.cheerAt.getTime() <= t && m.eventAt.getTime() - t > 10 * 60_000)
    .sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime())[0]
  return before ? { moment: before, phase: 'before' } : null
}

const whenLabel = (m: Pick<UserMoment, 'eventAt' | 'hasTime'>, timeZone: string) => {
  const label = localClock(m.eventAt, timeZone).label
  return m.hasTime ? label : label.slice(0, 14)
}

/** 먼저 연락할 기회로 — 보낼지·뭐라 할지는 캐릭터(자율성 계획) 또는 기존 경로가 정한다. 긴급도가 높아 바쁜 중에도 짧은 문자는 나간다. */
export function momentIntent(m: UserMoment, phase: MomentPhase, timeZone: string): RealityIntent {
  const when = whenLabel(m, timeZone)
  return {
    channel: 'message', urgency: 0.95, momentKey: `${m.id}:${phase}`,
    reason: phase === 'before'
      ? `사용자 일정 챙기기: 사용자가 직접 말한 '${m.about}'(${when})이 곧이다. 그 말을 기억하고 있다가 먼저 응원하거나 챙기는 연락 — 일정을 말해 준 그 대화를 떠올리게, 부담 주지 않게 짧게.`
      : `사용자 일정 후속: 사용자가 말한 '${m.about}'(${when})이 끝났을 때다. 어땠는지 궁금해서 먼저 묻는 연락 — 이미 대화에서 결과를 들었다면 다시 묻지 말고 그 얘기에 이어 마음을 전한다.`,
  }
}

/** 대화 맥락 한 줄씩 — 캐릭터가 기억하는 사용자의 일정. 지난 이틀부터 앞으로 2주까지. */
export function momentLines(moments: readonly UserMoment[], now: Date, timeZone: string): string[] {
  const t = now.getTime()
  return moments.filter(m => m.eventAt.getTime() > t - 2 * 86_400_000 && m.eventAt.getTime() < t + 14 * 86_400_000)
    .sort((a, b) => a.eventAt.getTime() - b.eventAt.getTime())
    .map(m => `${whenLabel(m, timeZone)} · ${m.about} — ${m.eventAt.getTime() > t ? '아직 전' : '이미 지났다(결과를 아직 못 들었다면 궁금할 만하다)'}`)
}
