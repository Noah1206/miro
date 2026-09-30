'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { isLanguage } from '@miro/domain'
import { db, userSettings } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { LANGUAGE_COOKIE, type Language, type Messages } from './index'
import { messagesFor } from './server'

/**
 * 언어 바꾸기. 화면은 쿠키를 읽고(로그인 전에도), 로그인했으면 설정에도 남긴다 — 앱 밖 연락처럼 요청이 없는 일과
 * 다른 기기(로그인할 때 쿠키를 다시 맞춘다)가 이 값을 읽는다.
 */
export async function setLanguage(language: string): Promise<void> {
  if (!(await saveLanguage(language))) return
  revalidatePath('/', 'layout')
}

/**
 * 화면을 다시 그리지 않고 언어만 바꾼다 — 그 언어의 사전을 돌려주면 화면이 제자리에서 글자만 갈아 끼운다.
 * 온보딩처럼 입력 중인 화면에서 쓴다: 서버에서 화면 전체를 다시 받으면 한순간 비었다 다시 그려져 깜빡였다(9/30).
 */
export async function chooseLanguage(language: string): Promise<Messages | null> {
  if (!(await saveLanguage(language))) return null
  return messagesFor(language as Language)
}

async function saveLanguage(language: string): Promise<boolean> {
  if (!isLanguage(language)) return false
  ;(await cookies()).set(LANGUAGE_COOKIE, language, { path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 365 })
  const user = await currentUser()
  if (user) await db.insert(userSettings).values({ userId: user.id, language })
    .onConflictDoUpdate({ target: userSettings.userId, set: { language, updatedAt: new Date() } })
  return true
}
