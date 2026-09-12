'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, messages, roleplaySessions } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { contextFromWorld, getOrGenerate } from '@/lib/simulation/media'
import { UsageExceededError, exceededMessage } from '@/lib/usage/guard'

export type MediaState = { error: string | null; notice: string | null }

/**
 * AI 사진.
 *
 * 사용자가 "사진 보내줘" 라고 입력해야만 동작하는 구조가 아니다 —
 * 캐릭터 행동이나 선연락에서도 같은 경로로 호출된다.
 * 현재 World State 를 읽으므로 Chat 에서 이동한 장소가 그대로 반영된다.
 */
export async function requestPhoto(_prev: MediaState, form: FormData): Promise<MediaState> {
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')

  const loaded = await loadSession(sessionId, user.id)
  if (!loaded) return { error: '대화를 찾을 수 없습니다.', notice: null }

  const context = await contextFromWorld(sessionId)
  if (!context) return { error: '현재 상태를 불러오지 못했습니다.', notice: null }

  try {
    const media = await getOrGenerate({
      sessionId,
      characterId: loaded.characterId,
      characterName: loaded.characterName,
      kind: 'photo',
      context,
      usage: { userId: user.id },
    })

    await db.insert(messages).values({
      sessionId,
      role: 'character',
      kind: 'photo',
      content: media.url,
      turnIndex: loaded.snapshot.turnCount,
      mediaId: media.id,
    })

    await db.update(roleplaySessions).set({ lastInteractionAt: new Date() })
      .where(eq(roleplaySessions.id, sessionId))

    revalidatePath(`/chat/${sessionId}`)
    return { error: null, notice: media.providerNotice }
  } catch (e) {
    if (e instanceof UsageExceededError) return { error: exceededMessage(e), notice: null }
    // 이미지 생성 실패 시 텍스트 역할극은 그대로 유지한다 (명세서 5.3 예외).
    return { error: '사진을 만들지 못했습니다. 대화는 계속할 수 있습니다.', notice: null }
  }
}
