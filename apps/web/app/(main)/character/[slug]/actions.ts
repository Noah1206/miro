'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createRoleplaySession } from '@/lib/simulation/start'
import { track } from '@/lib/analytics/track'

/** 역할극 시작 (n18). 세션 생성 규칙은 lib/simulation/start 에 있다 — 알파와 같은 경로. */
export async function startRoleplay(key: string, form?: FormData): Promise<void> {
  const user = await requireUser()
  // 11/12 성인 전용 작품은 언베일(본인인증 성인)을 켠 사람만 시작한다 — 화면 버튼은 인증 흐름으로 바뀌지만 서버도 막는다.
  const { getCharacterByKey } = await import('@/lib/characters')
  const { homeUnveilEnabled } = await import('@/lib/home-mode')
  const c = await getCharacterByKey(key, user.id)
  if (c?.adultOnly && c.ownerId !== user.id && !(await homeUnveilEnabled(user.id))) redirect(`/character/${key}`)
  // 고른 시작 상황(상세 화면의 도입부 칩). 이미 대화방이 있으면 무시되고 이어진다.
  const scene = form?.get('scene')
  const s = await createRoleplaySession(user.id, key, { scene: typeof scene === 'string' ? scene : undefined, fresh: form?.get('fresh') === '1' })
  if (s.created) {
    void track(user.id, 'character_selected', { characterId: s.characterId, official: s.isOfficial })
    void track(user.id, 'rp_started', { sessionId: s.sessionId, characterId: s.characterId })
  }
  // redirect 는 throw 로 동작하므로 반드시 트랜잭션 밖에서 호출한다.
  redirect(`/chat/${s.sessionId}`)
}

/** 11/11 응원하기 — 충전한 토큰으로 만든 사람을 응원한다(만든 사람이 70% 를 받는다). 실패 이유는 화면이 문구로 바꾼다. */
export async function cheerCreator(characterId: string, amount: number, requestId: string): Promise<{ ok: true } | { ok: false; reason: 'insufficient' | 'not_cheerable' | 'own_character' | 'invalid' }> {
  const user = await requireUser()
  const { sendCheer, CheerError } = await import('@/lib/usage/creator-reward')
  const { UsageExceededError } = await import('@/lib/usage/guard')
  try {
    const done = await sendCheer({ userId: user.id, characterId, amount, requestId })
    // 11/11 크리에이터 알림 — 응원이 오면 만든 사람 기기로 바로(응답 뒤에 보내 응원 버튼이 기다리지 않게, 실패해도 응원은 그대로).
    if (done) {
      const { afterResponse } = await import('@/lib/defer')
      void afterResponse(async () => {
        const [{ pushToUser }, { characterPushIcon }] = await Promise.all([import('@/lib/push/to-user'), import('@/lib/push/character-icon')])
        const from = user.displayName?.trim() || '누군가'
        await pushToUser(done.ownerId, { title: '응원이 도착했어요', body: `${from}님이 '${done.characterName}'에 응원을 보냈어요 · 수익 +${done.earned.toLocaleString('ko-KR')}`,
          url: '/earnings', tag: `cheer:${requestId}`, icon: characterPushIcon(done.images) }).catch(() => {})
      })
    }
    return { ok: true }
  } catch (e) {
    if (e instanceof UsageExceededError) return { ok: false, reason: 'insufficient' }
    if (e instanceof CheerError) return { ok: false, reason: e.message === 'own_character' ? 'own_character' : e.message === 'not_cheerable' ? 'not_cheerable' : 'invalid' }
    throw e
  }
}
