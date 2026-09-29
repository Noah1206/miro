'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isLanguage } from '@miro/domain'
import { db, userSettings } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { LANGUAGE_COOKIE } from './index'

/**
 * 언어 바꾸기. 화면은 쿠키를 읽고(로그인 전에도), 로그인했으면 설정에도 남긴다 — 앱 밖 연락처럼 요청이 없는 일과
 * 다른 기기(로그인할 때 쿠키를 다시 맞춘다)가 이 값을 읽는다.
 */
export async function setLanguage(language: string): Promise<void> {
  if (!isLanguage(language)) return
  ;(await cookies()).set(LANGUAGE_COOKIE, language, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 })
  const user = await currentUser()
  if (user) await db.insert(userSettings).values({ userId: user.id, language })
    .onConflictDoUpdate({ target: userSettings.userId, set: { language, updatedAt: new Date() } })
  revalidatePath('/', 'layout')
}
