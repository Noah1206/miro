'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * 11/13 '지금 접속 중' 신호 — 화면을 보고 있는 동안 45초마다, 화면을 옮길 때마다 한 번. 아무것도 그리지 않는다.
 * 처음 들어온 주소의 utm_source 와 어디서 왔는지(referrer 의 호스트)를 같이 보낸다 — 홈을 거치지 않고 작품으로 바로 온 사람도 잡힌다.
 */
export function PresenceBeacon() {
  const path = usePathname()
  useEffect(() => {
    let ref: string | null = null
    try { const h = document.referrer ? new URL(document.referrer).host : ''; ref = h && h !== location.host ? h : null } catch {}
    const src = new URLSearchParams(location.search).get('utm_source')
    const send = () => {
      if (document.visibilityState !== 'visible') return
      void fetch('/api/presence', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, src, ref }) }).catch(() => {})
    }
    send()
    const timer = setInterval(send, 45_000)
    document.addEventListener('visibilitychange', send)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', send) }
  }, [path])
  return null
}
