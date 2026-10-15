'use server'

import { redirect } from 'next/navigation'
import { createRoleplaySession } from '@/lib/simulation/start'
import { setHomeUnveilFor } from '@/lib/home-mode'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { db, roleplaySessions } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { msg } from '@/lib/i18n'
import { changeStoryDate, type StoryDateResult } from '@/lib/simulation/story-date'

// 캐릭터챗 한 턴은 스트리밍 경로(/api/turn)로 간다(10/9) — 서버 액션은 답을 받는 대로 보낼 수 없다.

export async function setStoryDate(sessionId: string, date: string, expectedDate: string | null): Promise<StoryDateResult> {
  const user = await requireUser()
  const result = await changeStoryDate(sessionId, user.id, date, expectedDate)
  if (result.ok) revalidatePath(`/chat/${sessionId}`)
  return result
}

/**
 * 이 대화방의 성인 모드 켜기·끄기(10/2). 켤 때마다 서버가 다시 판정한다(인증·정책 동의·캐릭터 나이·전용 모델).
 * 처음 켤 때는 나이 확인·성인 콘텐츠 정책 동의 두 체크가 있어야 한다(agreed) — 본인인증과 함께 쓰는 동의 절차다(10/2 결정).
 * 처음 켠 시각은 지우지 않는다 — 한 번 켠 방은 꺼도 성인 전용 모델로 이어진다.
 */
export async function setAdultMode(sessionId: string, on: boolean, agreed = false, level?: 'soft' | 'deep' | 'explicit'): Promise<{ error: string | null }> {
  const user = await requireUser()
  const [s] = await db.select({ characterId: roleplaySessions.characterId, adultSince: roleplaySessions.adultSince }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))).limit(1)
  if (!s) return { error: msg('대화를 찾을 수 없습니다.') }
  const preference = await setHomeUnveilFor(user.id, on, agreed)
  if (!preference.ok) return { error: preference.error }
  try {
    const target = await createRoleplaySession(user.id, s.characterId, { unveil: on })
    redirect(`/chat/${target.sessionId}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('UNVEIL_UNAVAILABLE:')) return { error: error.message.slice('UNVEIL_UNAVAILABLE:'.length) }
    throw error
  }
}
