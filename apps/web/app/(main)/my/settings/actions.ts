'use server'
import { z } from 'zod'
import { db, userSettings } from '@miro/db'
import { requireUser } from '@/lib/auth'

const HHMM = z.string().regex(/^\d{2}:\d{2}$/)
const Form = z.object({
  pushEnabled: z.boolean(), voiceCallEnabled: z.boolean(), videoCallEnabled: z.boolean(),
  quietHoursEnabled: z.boolean(), quietHoursStart: HHMM, quietHoursEnd: HHMM,
  timeZone: z.string().min(1).max(64),
})
export type SettingsState = { saved: boolean; error: string | null }

/** 알림·통화·야간 연락 설정 (명세서 6장 수용기준 4). 선연락은 이 값을 발송 직전에 읽는다. */
export async function saveSettings(_p: SettingsState, form: FormData): Promise<SettingsState> {
  const user = await requireUser()
  const parsed = Form.safeParse({
    pushEnabled: form.get('pushEnabled') === 'on', voiceCallEnabled: form.get('voiceCallEnabled') === 'on',
    videoCallEnabled: form.get('videoCallEnabled') === 'on', quietHoursEnabled: form.get('quietHoursEnabled') === 'on',
    quietHoursStart: form.get('quietHoursStart'), quietHoursEnd: form.get('quietHoursEnd'), timeZone: form.get('timeZone'),
  })
  if (!parsed.success) return { saved: false, error: '입력을 확인해 주세요.' }
  try { Intl.DateTimeFormat(undefined, { timeZone: parsed.data.timeZone }) } catch { return { saved: false, error: '알 수 없는 시간대입니다.' } }
  await db.insert(userSettings).values({ userId: user.id, ...parsed.data })
    .onConflictDoUpdate({ target: userSettings.userId, set: { ...parsed.data, updatedAt: new Date() } })
  // No revalidation: every input is controlled and already shows the saved values. Re-sending the page tree kept
  // the form pending past the E2E 10s wait under load; other pages are dynamic and re-read on navigation.
  return { saved: true, error: null }
}
