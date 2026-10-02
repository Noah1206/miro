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

/**
 * 사용자 현지 시각의 ISO 8601(오프셋 포함, '2026-10-02T08:50:00.000+09:00'). 기록 시각을 UTC 로 주면 지금 시각(현지)과 날짜가 어긋나
 * 한국의 새벽~오전 9시 대화를 모델이 '어제'라고 불렀다(10/2 실측). Date.parse 로 다시 읽어도 같은 순간이다.
 */
export function localIso(at: Date, timeZone: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((x) => [x.type, x.value]))
  const offset = Math.round((Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
  const abs = Math.abs(offset)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${String(at.getUTCMilliseconds()).padStart(3, '0')}${offset < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

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
