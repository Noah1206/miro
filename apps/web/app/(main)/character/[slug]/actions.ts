'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createRoleplaySession } from '@/lib/simulation/start'
import { track } from '@/lib/analytics/track'

/** 역할극 시작 (n18). 세션 생성 규칙은 lib/simulation/start 에 있다 — 알파와 같은 경로. */
export async function startRoleplay(key: string, form?: FormData): Promise<void> {
  const user = await requireUser()
  // 고른 시작 상황(상세 화면의 도입부 칩). 이미 대화방이 있으면 무시되고 이어진다.
  const scene = form?.get('scene')
  const s = await createRoleplaySession(user.id, key, { scene: typeof scene === 'string' ? scene : undefined })
  if (s.created) {
    void track(user.id, 'character_selected', { characterId: s.characterId, official: s.isOfficial })
    void track(user.id, 'rp_started', { sessionId: s.sessionId, characterId: s.characterId })
  }
  // redirect 는 throw 로 동작하므로 반드시 트랜잭션 밖에서 호출한다.
  redirect(`/chat/${s.sessionId}`)
}
