'use server'

import { redirect } from 'next/navigation'
import { db, alphaWaitlist } from '@miro/db'
import { createAlphaSession, getAlphaSession } from '@/lib/alpha/session'
import { trackAlpha } from '@/lib/alpha/track'

/** 답장하기 — 게스트 계정과 세션을 만들고(이미 있으면 그대로) 대화로 들어간다. 회원가입 없음. */
export async function startExperience(): Promise<void> {
  const existing = await getAlphaSession()
  const s = existing ?? await createAlphaSession()
  if (!existing) trackAlpha(s.userId, 'experience_start', { sessionId: s.sessionId })
  redirect('/alpha/chat')
}

export type WaitlistState = { done: boolean; error: string | null }

/** 이메일 하나. 성공하면 관계의 연속성을 말한다 — "신청 완료" 로 끝내지 않는다. */
export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return { done: false, error: '이메일을 다시 확인해 주세요.' }
  const session = await getAlphaSession()
  await db.insert(alphaWaitlist).values({ email, userId: session?.userId ?? null }).onConflictDoNothing()
  trackAlpha(session?.userId ?? null, 'waitlist_complete')
  return { done: true, error: null }
}
