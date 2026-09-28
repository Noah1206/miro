'use server'

import { requireUser } from '@/lib/auth'
import { turnFromForm, type TurnState } from '@/lib/simulation/turn-action'

export type { TurnState }

/** 자유 RP 한 턴. 파이프라인은 lib/simulation/turn 에 있다 — /api/chat, /messages 와 같은 코드. */
export async function sendTurn(_prev: TurnState, form: FormData): Promise<TurnState> {
  const user = await requireUser()
  return turnFromForm(user.id, form, { mode: 'chat', path: (id) => `/chat/${id}` })
}
