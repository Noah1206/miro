'use server'

import { redirect } from 'next/navigation'
import { createRoleplaySession } from '@/lib/simulation/start'
import { setHomeUnveilFor } from '@/lib/home-mode'
import { revalidatePath } from 'next/cache'
import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { characters, db, messages, roleplaySessions } from '@miro/db'
import { selectableVoice } from '@/lib/voice'
import { requireUser } from '@/lib/auth'
import { msg } from '@/lib/i18n'
import { changeStoryDate, type StoryDateResult } from '@/lib/simulation/story-date'
import { bridgeUnveilToNormal } from '@/lib/simulation/unveil-bridge'
import { afterResponse } from '@/lib/defer'
import { observe } from '@/lib/observe'
import { track } from '@/lib/analytics/track'
import { undoLastTurn } from '@/lib/simulation/reroll'

// 캐릭터챗 한 턴은 스트리밍 경로(/api/turn)로 간다(10/9) — 서버 액션은 답을 받는 대로 보낼 수 없다.

/**
 * 11/19 사용자: 마지막 턴 되돌리기 — 그 답과 보낸 말을 지우고(세계·관계·기억도 그 턴 전으로) 보낸 말은 입력창에 돌려준다.
 * 다시 받기와 달리 차감은 돌려주지 않는다.
 */
export async function undoTurn(sessionId: string, replyId: string): Promise<{ ok: true; input: string; messageIds: string[] } | { ok: false; error: string }> {
  const user = await requireUser()
  const r = await undoLastTurn(user.id, sessionId, replyId, { refund: false })
  return r.ok ? { ok: true, input: r.input, messageIds: r.messageIds } : { ok: false, error: msg('이 답은 지금 되돌릴 수 없어요.') }
}

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
    if (on) void track(user.id, 'unveil_enabled', { characterId: s.characterId })
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

/**
 * 갤러리(11/8) — 만든 사람이 넣은 상황별 사진(characters.situation_images) 중 이 사용자가 이 캐릭터와의 대화에서 본 것(해금)만 사진을 준다.
 * 해금 = 어느 대화방이든 그 사진이 채팅에 떴던 기록(messages kind=photo). 사진 주소의 ?v= 는 다시 올리면 바뀌어서 떼고 비교한다.
 * 언베일 전용 사진은 언베일 방에서만 선명하게(blurred) — 일반 방에선 흐리게 보인다.
 */
export async function roomGallery(sessionId: string): Promise<{ items: Array<{ image: string | null; blurred: boolean }> }> {
  const user = await requireUser()
  const [s] = await db.select({ characterId: roleplaySessions.characterId, adultSince: roleplaySessions.adultSince, images: characters.situationImages })
    .from(roleplaySessions).innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))).limit(1)
  if (!s?.images.length) return { items: [] }
  const base = (u: string) => u.split('?')[0]!
  const shown = new Set((await db.select({ content: messages.content }).from(messages)
    .innerJoin(roleplaySessions, eq(roleplaySessions.id, messages.sessionId))
    .where(and(eq(roleplaySessions.userId, user.id), eq(roleplaySessions.characterId, s.characterId), eq(messages.kind, 'photo'), isNull(messages.hiddenAt))))
    .map(m => base(m.content)))
  return { items: s.images.map(e => shown.has(base(e.image)) ? { image: e.image, blurred: !!e.adult && !s.adultSince } : { image: null, blurred: false }) }
}

/**
 * 11/24 사용자: 같은 캐릭터로 새 대화방 — 지금 방은 지우지 않고 대화 목록에 남긴 채(보관) 처음부터 새 방을 연다.
 * 캐릭터 상세의 '새로 대화'와 같은 길(createRoleplaySession fresh). 언베일 여부는 방이 아니라 턴마다 정하므로 여기서 가리지 않는다.
 */
export async function startNewRoom(sessionId: string): Promise<{ sessionId: string } | { error: string }> {
  const user = await requireUser()
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { error: msg('대화방을 찾을 수 없어요.') }
  const [room] = await db.select({ characterId: roleplaySessions.characterId }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))).limit(1)
  if (!room) return { error: msg('대화방을 찾을 수 없어요.') }
  try {
    const started = await createRoleplaySession(user.id, room.characterId, { fresh: true, unveil: false })
    return { sessionId: started.sessionId }
  } catch { return { error: msg('지금은 새 대화방을 열 수 없어요. 잠시 뒤 다시 시도해 주세요.') } }
}

export type CharacterRoom = { id: string; createdAt: string; lastAt: string; turns: number; preview: string | null; current: boolean }
/** 11/26 사용자: 같은 캐릭터의 대화방들 — 대화 목록에는 캐릭터당 한 줄만 두고, 채팅방 메뉴에서 이 목록으로 오간다. */
export async function listCharacterRooms(sessionId: string): Promise<CharacterRoom[]> {
  const user = await requireUser()
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return []
  const [room] = await db.select({ characterId: roleplaySessions.characterId }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt))).limit(1)
  if (!room) return []
  const rows = await db.execute<{ id: string; created_at: string; last_at: string; turns: number; preview: string | null }>(sql`
    SELECT r.id, r.created_at, r.last_interaction_at AS last_at, r.turn_count AS turns,
      (SELECT left(m.content, 80) FROM messages m WHERE m.session_id = r.id AND m.hidden_at IS NULL AND m.kind = 'text' ORDER BY m.created_at DESC LIMIT 1) AS preview
    FROM roleplay_sessions r WHERE r.user_id = ${user.id}::uuid AND r.character_id = ${room.characterId}::uuid AND r.deleted_at IS NULL
    ORDER BY r.last_interaction_at DESC LIMIT 30`)
  return [...rows].map(r => ({ id: r.id, createdAt: new Date(r.created_at).toISOString(), lastAt: new Date(r.last_at).toISOString(), turns: r.turns, preview: r.preview, current: r.id === sessionId }))
}

/** 11/26 다른 대화방으로 옮길 때 — 그 방을 진행 중으로, 같은 캐릭터의 다른 방은 보관으로(대화 목록엔 진행 중인 방 한 줄). */
export async function openCharacterRoom(fromSessionId: string, toSessionId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser()
  if (![fromSessionId, toSessionId].every(id => /^[0-9a-f-]{36}$/i.test(id))) return { error: msg('대화방을 찾을 수 없어요.') }
  const rows = await db.select({ id: roleplaySessions.id, characterId: roleplaySessions.characterId }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.userId, user.id), isNull(roleplaySessions.deletedAt), sql`${roleplaySessions.id} in (${fromSessionId}::uuid, ${toSessionId}::uuid)`))
  const target = rows.find(r => r.id === toSessionId), from = rows.find(r => r.id === fromSessionId)
  if (!target || !from || target.characterId !== from.characterId) return { error: msg('대화방을 찾을 수 없어요.') }
  await db.update(roleplaySessions).set({ status: 'archived' }).where(and(eq(roleplaySessions.userId, user.id), eq(roleplaySessions.characterId, target.characterId), ne(roleplaySessions.id, toSessionId), isNull(roleplaySessions.deletedAt)))
  await db.update(roleplaySessions).set({ status: 'active', lastInteractionAt: new Date() }).where(eq(roleplaySessions.id, toSessionId))
  return { ok: true }
}
