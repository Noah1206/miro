'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createRoleplaySession } from '@/lib/simulation/start'
import { track } from '@/lib/analytics/track'

/** 역할극 시작 (n18). 세션 생성 규칙은 lib/simulation/start 에 있다 — 알파와 같은 경로. */
export async function startRoleplay(key: string): Promise<void> {
  const user = await requireUser()
  const s = await createRoleplaySession(user.id, key)
  if (s.created) {
    void track(user.id, 'character_selected', { characterId: s.characterId, official: s.isOfficial })
    void track(user.id, 'rp_started', { sessionId: s.sessionId, characterId: s.characterId })
  }
  // redirect 는 throw 로 동작하므로 반드시 트랜잭션 밖에서 호출한다.
  redirect(`/chat/${s.sessionId}`)
}
