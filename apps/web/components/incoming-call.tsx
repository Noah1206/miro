import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { acceptCall, declineCall, owned, ringingFor } from '@/lib/call/service'
import { exceededMessage, UsageExceededError } from '@/lib/usage/guard'

async function accept(callId: string) {
  'use server'
  const user = await requireUser()
  try {
    const call = await acceptCall(user.id, callId)
    if (call) redirect(`/call/${callId}`)
  } catch (e) {
    if (e instanceof UsageExceededError) {
      // 받을 수 없으면 거절로 남긴다 — 사용자가 알 수 있게.
      const call = await owned(user.id, callId)
      await declineCall(user.id, callId)
      console.info('[call] accept blocked by usage', exceededMessage(e))
      if (call) revalidatePath(`/chat/${call.sessionId}`)
    } else throw e
  }
}
async function decline(callId: string) {
  'use server'
  const user = await requireUser()
  const call = await owned(user.id, callId)
  await declineCall(user.id, callId)
  // 거절 기록(call_record)이 바로 보이도록 현재 화면을 갱신한다.
  if (call) revalidatePath(`/chat/${call.sessionId}`)
  revalidatePath('/home')
}

/** 수신 통화 화면(n34). 음성과 영상은 별도 표현이며, 채널은 수락 전에 보인다. */
export async function IncomingCall({ userId, characterName }: { userId: string; characterName?: string }) {
  const call = await ringingFor(userId)
  if (!call) return null
  const video = call.channel === 'video'

  return (
    <div data-incoming-call={call.channel} role="dialog" aria-label={video ? '수신 영상통화' : '수신 음성통화'} style={{
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', gap: 14, padding: 24,
      background: video ? 'linear-gradient(160deg, #1a1420, #0E0E10)' : 'var(--bg)',
    }}>
      <p style={{ fontSize: 12, letterSpacing: '0.16em', color: video ? 'var(--accent-strong)' : 'var(--text-secondary)', margin: 0 }}>
        {video ? '● 영상통화 수신' : '음성통화 수신'}
      </p>
      <div style={{
        width: 112, height: 112, borderRadius: video ? 20 : 999, background: 'var(--elevated)',
        border: `2px solid ${video ? 'var(--accent)' : 'var(--border)'}`,
      }} />
      <h2 style={{ fontSize: 26, margin: 0 }}>{characterName ?? '캐릭터'}</h2>
      {call.reason && <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>{call.reason}</p>}

      <div style={{ display: 'flex', gap: 28, marginTop: 28 }}>
        <form action={decline.bind(null, call.id)}>
          <button type="submit" style={round('#D9363E')}>거절</button>
        </form>
        <form action={accept.bind(null, call.id)}>
          <button type="submit" style={round('#2EA85D')}>{video ? '영상으로 받기' : '받기'}</button>
        </form>
      </div>
    </div>
  )
}

const round = (bg: string): React.CSSProperties => ({
  width: 84, height: 84, borderRadius: 999, border: 'none', background: bg,
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
})
