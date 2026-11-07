'use server'

import { redirect } from 'next/navigation'
import { createRoleplaySession } from '@/lib/simulation/start'
import { setHomeUnveilFor } from '@/lib/home-mode'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { characters, db, roleplaySessions } from '@miro/db'
import { selectableVoice } from '@/lib/voice'
import { requireUser } from '@/lib/auth'
import { msg } from '@/lib/i18n'
import { changeStoryDate, type StoryDateResult } from '@/lib/simulation/story-date'
import { bridgeUnveilToNormal } from '@/lib/simulation/unveil-bridge'
import { afterResponse } from '@/lib/defer'
import { observe } from '@/lib/observe'

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
    // 언베일 방을 끄고 일반 방으로 갈 때 — 노골적 표현을 뺀 줄거리만 일반 방 기억으로 넘긴다(응답 뒤, 실패해도 이동은 그대로).
    if (!on && s.adultSince && target.sessionId !== sessionId) await afterResponse(() => bridgeUnveilToNormal(user.id, sessionId, target.sessionId)
      .catch(e => observe('unveil.bridge_failed', { sessionId: target.sessionId, error: e instanceof Error ? e.message.slice(0, 120) : 'unknown' })))
    redirect(`/chat/${target.sessionId}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('UNVEIL_UNAVAILABLE:')) return { error: error.message.slice('UNVEIL_UNAVAILABLE:'.length) }
    throw error
  }
}

/**
 * 이 방에서 화자 목소리 바꾸기(11/8). key '' = 주인공, 그 밖은 카드의 히로인 이름(ensemble_voices 키). voiceId '' = 자동으로 되돌리기.
 * 고를 수 있는 목소리(공식·내 것·공개)만 받는다 — 읽을 때도 다시 본다(lib/speech/access segmentVoice).
 */
export async function setRoomVoice(sessionId: string, key: string, voiceId: string): Promise<{ error: string | null }> {
  const user = await requireUser()
  const [s] = await db.select({ overrides: roleplaySessions.voiceOverrides, ensemble: characters.ensembleVoices }).from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))).limit(1)
  if (!s) return { error: msg('대화를 찾을 수 없습니다.') }
  if (key !== '' && !Object.keys(s.ensemble ?? {}).includes(key)) return { error: msg('목소리를 바꿀 수 없어요.') }
  const next = { ...(s.overrides ?? {}) }
  if (!voiceId) delete next[key]
  else {
    const ok = await selectableVoice(voiceId, user.id)
    if (!ok) return { error: msg('목소리를 바꿀 수 없어요.') }
    next[key] = ok
  }
  await db.update(roleplaySessions).set({ voiceOverrides: next }).where(eq(roleplaySessions.id, sessionId))
  return { error: null }
}
