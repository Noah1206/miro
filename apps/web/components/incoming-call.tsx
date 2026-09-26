import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { acceptCall, declineCall, owned, ringingFor } from '@/lib/call/service'
import { exceededMessage, UsageExceededError } from '@/lib/usage/guard'
import { IncomingCallScreen } from './incoming-call-screen'
import { RingWatcher } from './ring-watcher'
import { feature } from '@miro/config'

async function accept(callId: string) {
  'use server'
  const user = await requireUser()
  try { const call = await acceptCall(user.id, callId); if (call) redirect(`/call/${callId}`) }
  catch (e) {
    if (e instanceof UsageExceededError) {
      const call = await owned(user.id, callId); await declineCall(user.id, callId, 'usage')
      console.info('[call] accept blocked by usage', exceededMessage(e)); if (call) { revalidatePath(`/chat/${call.sessionId}`); revalidatePath(`/messages/${call.sessionId}`) }
    } else throw e
  }
}
async function decline(callId: string) {
  'use server'
  const user = await requireUser(); const call = await owned(user.id, callId)
  await declineCall(user.id, callId); if (call) { revalidatePath(`/chat/${call.sessionId}`); revalidatePath(`/messages/${call.sessionId}`) }; revalidatePath('/home')
}

/**
 * 수신 화면(n34). 채널은 받기 전에 보인다. 서버 컴포넌트가 데이터를, 클라이언트가 타임라인을 맡는다.
 * (main) 레이아웃에 한 번 붙는다 — 어느 화면에 있든 벨이 울린다. RingWatcher 가 몇 초마다 물어 새 벨이 오면 화면을 새로 받는다.
 */
export async function IncomingCall({ userId, characterName }: { userId: string; characterName?: string }) {
  // 전화가 울릴 수 없는 환경(운영은 통화 기능이 꺼져 있다)에서는 묻지도, 8초마다 폴링하지도 않는다.
  if (!feature('voiceCall') && !feature('videoCall')) return null
  const call = await ringingFor(userId)
  return <>
    <RingWatcher ringing={call?.id ?? null} />
    {call && <IncomingCallScreen channel={call.channel} name={characterName ?? call.characterName} reason={call.reason} acceptAction={accept.bind(null, call.id)} declineAction={decline.bind(null, call.id)} />}
  </>
}
