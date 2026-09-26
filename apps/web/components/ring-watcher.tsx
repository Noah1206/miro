'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const EVERY_MS = 8_000

/**
 * 벨이 실시간으로 울리게 — 서버 컴포넌트는 페이지를 받을 때만 통화를 보므로, 열어 둔 화면에서는 이게 대신 묻는다.
 * 탭이 보일 때만 8초마다 한 번. 상태가 바뀌면(새 벨, 벨 사라짐) 화면을 다시 받아 수신 화면을 띄우거나 내린다.
 * ponytail: 폴링. SSE/푸시로 바꿀 때 이 파일만 바뀐다.
 */
export function RingWatcher({ ringing }: { ringing: string | null }) {
  const router = useRouter()
  const known = useRef(ringing)
  useEffect(() => { known.current = ringing }, [ringing])
  useEffect(() => {
    let stopped = false
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/api/calls/ringing', { cache: 'no-store' })
        if (!r.ok) return
        const { id } = (await r.json()) as { id: string | null }
        if (!stopped && id !== known.current) { known.current = id; router.refresh() }
      } catch { /* 네트워크가 잠깐 끊겨도 다음 번에 다시 묻는다. */ }
    }
    const timer = setInterval(check, EVERY_MS)
    document.addEventListener('visibilitychange', check)
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [router])
  return null
}
