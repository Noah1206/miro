import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { acceptCall, declineCall, owned, ringingFor } from '@/lib/call/service'
import { exceededMessage, UsageExceededError } from '@/lib/usage/guard'
import { IncomingCallScreen } from './incoming-call-screen'

async function accept(callId: string) {
  'use server'
  const user = await requireUser()
  try { const call = await acceptCall(user.id, callId); if (call) redirect(`/call/${callId}`) }
  catch (e) {
    if (e instanceof UsageExceededError) {
      const call = await owned(user.id, callId); await declineCall(user.id, callId)
      console.info('[call] accept blocked by usage', exceededMessage(e)); if (call) revalidatePath(`/chat/${call.sessionId}`)
    } else throw e
  }
}
async function decline(callId: string) {
  'use server'
  const user = await requireUser(); const call = await owned(user.id, callId)
  await declineCall(user.id, callId); if (call) revalidatePath(`/chat/${call.sessionId}`); revalidatePath('/home')
}

/** 수신 화면(n34). 채널은 받기 전에 보인다. 서버 컴포넌트가 데이터를, 클라이언트가 타임라인을 맡는다. */
export async function IncomingCall({ userId, characterName }: { userId: string; characterName?: string }) {
  const call = await ringingFor(userId)
  if (!call) return null
  return <IncomingCallScreen channel={call.channel} name={characterName ?? '캐릭터'} reason={call.reason} acceptAction={accept.bind(null, call.id)} declineAction={decline.bind(null, call.id)} />
}
