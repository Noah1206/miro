'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { acceptCall, declineCall, owned } from '@/lib/call/service'
import { exceededMessage, UsageExceededError } from '@/lib/usage/guard'

/** 수신 통화 받기. 이 시점에 사용량을 예약한다 — 제공량이 없으면 받지 못한 것으로 남긴다(거절 아님). */
export async function acceptIncomingCall(callId: string): Promise<void> {
  const user = await requireUser()
  try { const call = await acceptCall(user.id, callId); if (call) redirect(`/call/${callId}`) }
  catch (e) {
    if (e instanceof UsageExceededError) {
      const call = await owned(user.id, callId); await declineCall(user.id, callId, 'usage')
      console.info('[call] accept blocked by usage', exceededMessage(e)); if (call) { revalidatePath(`/chat/${call.sessionId}`); revalidatePath(`/messages/${call.sessionId}`) }
    } else throw e
  }
}

export async function declineIncomingCall(callId: string): Promise<void> {
  const user = await requireUser(); const call = await owned(user.id, callId)
  await declineCall(user.id, callId); if (call) { revalidatePath(`/chat/${call.sessionId}`); revalidatePath(`/messages/${call.sessionId}`) }; revalidatePath('/home')
}
