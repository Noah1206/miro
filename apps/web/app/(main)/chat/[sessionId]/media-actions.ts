'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db, characters, messages, roleplaySessions } from '@miro/db'
import { requireUser } from '@/lib/auth'
import { loadSession } from '@/lib/simulation/snapshot'
import { contextFromWorld, getOrGenerate } from '@/lib/simulation/media'
import { UsageExceededError, exceededMessage } from '@/lib/usage/guard'
import { adultModeGateFor, matureGateFor } from '@/lib/ops/safety'
import { unsafeRequest } from '@/lib/ai/local-image'
import { feature } from '@miro/config'
import { COPY } from '@/lib/copy'
import { msg } from '@/lib/i18n'
import { getT } from '@/lib/i18n/server'

export type MediaState = { error: string | null; notice: string | null }

/**
 * AI 사진.
 *
 * 사용자가 "사진 보내줘" 라고 입력해야만 동작하는 구조가 아니다 —
 * 캐릭터 행동이나 선연락에서도 같은 경로로 호출된다.
 * 현재 World State 를 읽으므로 Chat 에서 이동한 장소가 그대로 반영된다.
 */
export async function requestPhoto(_prev: MediaState, form: FormData): Promise<MediaState> {
  if (!feature('imageGeneration')) return { error: COPY.error.featureOff, notice: null }
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')

  const loaded = await loadSession(sessionId, user.id)
  if (!loaded || loaded.restricted) return { error: msg('대화를 찾을 수 없습니다.'), notice: null }
  // 사진은 미로 캐릭터의 것이다. 버튼을 숨기는 것과 별개로 서버가 거절한다.

  const context = await contextFromWorld(sessionId)
  if (!context) return { error: msg('현재 상태를 불러오지 못했습니다.'), notice: null }

  // 성인 표현 요청은 서버에서 다시 판정한다. 차단 시 사유와 다음 행동을 명확히 안내한다 (명세서 7.1 표시).
  if (form.get('mature') === 'on') {
    const gate = await matureGateFor(user.id, loaded.characterId)
    if (!gate.allowed) { const t = await getT(); return { error: `${t('성인 표현을 적용할 수 없습니다.')} ${t(gate.next)}`, notice: null } }
    // 성숙한 비주얼은 별도 캐릭터가 아니라 현재 장면의 연장선이다 — 같은 외형·장소, 표현만 다르다.
    context.outfit = 'mature'
  }

  // 언베일 사진(10/19): 이 대화방에서 언베일이 켜져 있고 서버 판정(성인 인증·19세 이상 캐릭터·페르소나)을 다시 통과할 때만 자체 오픈 모델로.
  const request = String(form.get('request') ?? '').trim().slice(0, 300) || undefined
  let unveil: { level: 'soft' | 'deep' | 'explicit'; characterAge: number; request?: string } | null = null
  if (loaded.snapshot.adultMode && loaded.adult.on) {
    const gate = await adultModeGateFor(user.id, loaded.characterId, sessionId)
    const [c] = await db.select({ age: characters.age }).from(characters).where(eq(characters.id, loaded.characterId)).limit(1)
    const age = Number.parseInt(String(c?.age ?? ''), 10)
    if (!gate.allowed || !Number.isFinite(age) || age < 19) return {error:msg('현재 언베일 이미지를 이용할 수 없어요.'),notice:null}
    unveil = { level: loaded.adult.level, characterAge: age, request }
  }
  const unsafe = unsafeRequest(request)
  if (unsafe === 'minor') return { error: msg('미성년자로 보이는 요청은 그릴 수 없어요.'), notice: null }
  if (unsafe === 'real_person') return { error: msg('실존 인물이나 실제 사진을 바탕으로 한 요청은 그릴 수 없어요.'), notice: null }

  try {
    const media = await getOrGenerate({
      sessionId,
      characterId: loaded.characterId,
      characterName: loaded.characterName,
      kind: 'photo',
      context,
      usage: { userId: user.id },
      unveil,
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
    return { error: null, notice: media.providerNotice ?? msg(media.cached?'기존 이미지를 보여드렸어요. 추가 차감은 없어요.':'이미지가 도착했어요.') }
  } catch (e) {
    if (e instanceof UsageExceededError) return { error: exceededMessage(e), notice: null }
    // 이미지 생성 실패 시 텍스트 역할극은 그대로 유지한다 (명세서 5.3 예외).
    return { error: msg('사진을 만들지 못했습니다. 대화는 계속할 수 있습니다.'), notice: null }
  }
}
