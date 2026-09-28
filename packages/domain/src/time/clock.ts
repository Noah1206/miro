/**
 * 현실 시계. 캐릭터는 실제 시각을 알아야 한다 — 밤 11시에 점심을 권하지 않도록.
 * 세계관의 시대와 무관하게 하루의 때·요일은 사용자의 현지 시각과 같이 흐른다.
 */
export type LocalClock = {
  /** ISO 8601 (UTC). */
  iso: string
  /** 사용자 시간대 (IANA). */
  timeZone: string
  /** 사람이 읽는 형태: '2026-09-26 (금) 14:32'. */
  label: string
  /** 0=일 … 6=토. */
  weekday: number
  /** 현지 시각 시(0-23)·분. */
  hour: number
  minute: number
  /** 하루의 때 — 프롬프트와 규칙이 같은 이름을 쓴다. */
  period: '새벽' | '아침' | '낮' | '저녁' | '밤'
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  const hour = Number(get('hour')), minute = Number(get('minute'))
  return {
    iso: now.toISOString(), timeZone,
    label: `${get('year')}-${get('month')}-${get('day')} (${WEEKDAYS[weekday] ?? '?'}) ${get('hour')}:${get('minute')}`,
    weekday: weekday < 0 ? 0 : weekday, hour, minute, period: periodOf(hour),
  }
}

export function periodOf(hour: number): LocalClock['period'] {
  if (hour < 6) return '새벽'
  if (hour < 11) return '아침'
  if (hour < 17) return '낮'
  if (hour < 21) return '저녁'
  return '밤'
}

/** 'HH:MM' → 분. 잘못된 값은 null. */
export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2])
  return h > 23 || mi > 59 ? null : h * 60 + mi
}
