'use client'
import { useEffect, useRef, useState } from 'react'
import { IncomingCallScreen } from './incoming-call-screen'
import { acceptIncomingCall, declineIncomingCall } from './incoming-call-actions'

export type RingingCall = { id: string; channel: 'voice' | 'video'; reason: string | null; characterName: string }

const EVERY_MS = 8_000

/**
 * 벨이 실시간으로 울리게 — 탭이 보일 때만 8초마다 지금 울리는 통화를 묻고, 바뀌면 수신 화면을 바로 그린다.
 * 화면 전체를 다시 받지 않는다(router.refresh 로는 공통 레이아웃이 다시 그려지지 않아 벨이 안 뜨는 경우가 있었다 — 9/26 데모).
 * ponytail: 폴링. SSE/푸시로 바꿀 때 이 파일만 바뀐다.
 */
export function RingWatcher({ initial }: { initial: RingingCall | null }) {
  const [call, setCall] = useState<RingingCall | null>(initial)
  const current = useRef(initial?.id ?? null)
  useEffect(() => { current.current = call?.id ?? null }, [call])
  useEffect(() => {
    let stopped = false
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/api/calls/ringing', { cache: 'no-store' })
        if (!r.ok) return
        const { call: next } = (await r.json()) as { call: RingingCall | null }
        if (!stopped && (next?.id ?? null) !== current.current) setCall(next)
      } catch { /* 네트워크가 잠깐 끊겨도 다음 번에 다시 묻는다. */ }
    }
    const timer = setInterval(check, EVERY_MS)
    document.addEventListener('visibilitychange', check)
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [])
  if (!call) return null
  return <IncomingCallScreen key={call.id} channel={call.channel} name={call.characterName} reason={call.reason}
    acceptAction={acceptIncomingCall.bind(null, call.id)}
    declineAction={async () => { await declineIncomingCall(call.id); setCall(null) }} />
}
