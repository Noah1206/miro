import { translate, type T } from '@/lib/i18n'
/** 보관함 목록의 글자. 서버와 브라우저가 같은 글자를 그려야 하므로 시간대를 고정하고 DOM 을 쓰지 않는다. */
const TIME_ZONE = 'Asia/Seoul'
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** 오늘이면 시각, 어제면 '어제', 그 전이면 월.일 — 문자 스레드처럼 한국 시간 기준(9/27 운영에서 서버 UTC 와 어긋나 React #418). */
export function dateLabel(d: Date | string, now = new Date(), t: T = (text, params) => translate(null, text, params)) {
  const date = new Date(d)
  const day = ymd(date)
  if (day === ymd(now)) {
    // ICU versions disagree on ko-KR day-period labels (PM vs 오후). Keep product copy stable.
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
    const hour = Number(parts.find(p => p.type === 'hour')!.value)
    const minute = parts.find(p => p.type === 'minute')!.value
    const time = `${hour % 12 || 12}:${minute}`
    return hour < 12 ? t('오전 {time}', { time }) : t('오후 {time}', { time })
  }
  if (day === ymd(new Date(now.getTime() - 86_400_000))) return t('어제')
  const [, month, dayOfMonth] = day.split('-')
  return `${Number(month)}.${Number(dayOfMonth)}`
}

/** 마지막 메시지 미리보기. 저장된 원문은 "이름: 대사" 줄이라 목록의 이름 옆에 이름이 또 보였다(9/27). 줄은 한 줄로 잇는다. */
export function preview(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(^|\\n)\\s*${escaped}:\\s*`, 'g'), '$1').replace(/\s*\n+\s*/g, ' ').trim()
}
