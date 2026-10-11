/** A chosen story day, independent of real timestamps and notification deadlines. */
export type NarrativeCalendar = {
  version: 1
  date: string
  previousDate: string | null
  changedAtTurn: number
}

export function validStoryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function storyDaysBetween(from: string, to: string): number {
  if (!validStoryDate(from) || !validStoryDate(to)) throw new Error('invalid_story_date')
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function shiftStoryDate(date: string, days: number): string {
  if (!validStoryDate(date) || !Number.isSafeInteger(days)) throw new Error('invalid_story_date')
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
  if (!validStoryDate(shifted)) throw new Error('invalid_story_date')
  return shifted
}

export function storyCalendarDirective(calendar: NarrativeCalendar | null | undefined, turnCount: number): string {
  if (!calendar || !validStoryDate(calendar.date)) return ''
  const days = calendar.previousDate && validStoryDate(calendar.previousDate) ? storyDaysBetween(calendar.previousDate, calendar.date) : null
  const changed = calendar.changedAtTurn === turnCount
  return [
    `Story date selected by the user: ${calendar.date}. This is the scene's calendar date, not the real clock. Keep this date until the user changes it.`,
    changed && days !== null && days > 0 ? `The scene has just moved forward ${days} calendar day(s) from ${calendar.previousDate}. On the next response, acknowledge the elapsed time naturally in this character's voice or action when it fits. Do not repeat a stock phrase every turn.` : '',
    changed && days !== null && days < 0 ? `The user moved the scene to an earlier date (${calendar.previousDate} -> ${calendar.date}), not forward by ${Math.abs(days)} days. Do not claim time passed forward. This does not erase history or undo committed events.` : '',
    'A calendar move alone does not prove new shared experiences, a fulfilled promise, consent, romance or greater intimacy. Preserve established memory and relationship; do not invent what either person did during the gap. Message storage timestamps are real audit times, not scene dates. Dates in this scene refer to this story calendar unless explicitly described as real-world contact times. Never advance real notification deadlines or the user\'s request for space because the story date changed.',
  ].filter(Boolean).join('\n')
}
