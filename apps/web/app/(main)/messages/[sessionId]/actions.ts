'use server'

import { redirect } from 'next/navigation'
import { voiceCallAllowed } from '@miro/config'
import { requireUser } from '@/lib/auth'
import { startOutgoingCall, UsageExceededError } from '@/lib/call/service'
import { turnFromForm, type TurnState } from '@/lib/simulation/turn-action'

export type { TurnState }

/** 문자 한 통. 캐릭터챗과 같은 파이프라인이되 messenger 모드 — 문자로 답하고 문자 페이지에만 남는다. */
export async function sendMessengerTurn(_prev: TurnState, form: FormData): Promise<TurnState> {
  const user = await requireUser()
  return turnFromForm(user.id, form, { mode: 'messenger', path: (id) => `/messages/${id}` })
}

/** 문자 페이지 머리의 통화 버튼. 성공이면 통화 화면으로, 실패면 이유를 주소에 실어 돌아온다. */
export async function placeVoiceCall(form: FormData): Promise<void> {
  const user = await requireUser()
  const sessionId = String(form.get('sessionId') ?? '')
  if (!voiceCallAllowed(user.id)) redirect(`/messages/${sessionId}?call=off`)
  let callId: string
  try { callId = await startOutgoingCall(user.id, sessionId, 'voice') }
  catch (e) { redirect(`/messages/${sessionId}?call=${e instanceof UsageExceededError ? 'usage' : 'failed'}`) }
  redirect(`/call/${callId}`)
}
