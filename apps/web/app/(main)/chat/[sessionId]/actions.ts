'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, roleplaySessions } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { adultModeGateFor } from '@/lib/ops/safety'
import { msg } from '@/lib/i18n'
import { turnFromForm, type TurnState } from '@/lib/simulation/turn-action'

export type { TurnState }

/** 자유 RP 한 턴. 파이프라인은 lib/simulation/turn 에 있다 — /api/chat, /messages 와 같은 코드. */
export async function sendTurn(_prev: TurnState, form: FormData): Promise<TurnState> {
  const user = await requireUser()
  return turnFromForm(user.id, form, { mode: 'chat', path: (id) => `/chat/${id}` })
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
  if (on) {
    if (!s.adultSince && agreed !== true) return { error: msg('나이 확인과 성인 콘텐츠 정책 동의가 필요해요.') }
    const gate = await adultModeGateFor(user.id, s.characterId)
    if (!gate.allowed) return { error: gate.next }
  }
  await db.update(roleplaySessions)
    .set(on ? { adultMode: true, adultSince: sql`coalesce(${roleplaySessions.adultSince}, now())`, ...(level && ['soft', 'deep', 'explicit'].includes(level) ? { adultLevel: level } : {}) } : { adultMode: false })
    .where(eq(roleplaySessions.id, sessionId))
  revalidatePath(`/chat/${sessionId}`)
  return { error: null }
}
