'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * 11/13 '지금 접속 중' 신호 — 화면을 보고 있는 동안 45초마다, 화면을 옮길 때마다 한 번. 아무것도 그리지 않는다.
 * 처음 들어온 주소의 utm_source 와 어디서 왔는지(referrer 의 호스트)를 같이 보낸다 — 홈을 거치지 않고 작품으로 바로 온 사람도 잡힌다.
 * path 는 usePathname 이라 쿼리가 없다(쿠폰 코드 등은 보내지 않는다).
 */
export function PresenceBeacon() {
  const path = usePathname()
  useEffect(() => {
    let ref: string | null = null
    try { const h = document.referrer ? new URL(document.referrer).host : ''; ref = h && h !== location.host ? h : null } catch {}
    const q = new URLSearchParams(location.search)
    // 11/24 검색 광고: 처음 들어온 출처·캠페인·키워드(utm_term)·광고 클릭(gclid) — 서버가 첫 방문 쿠키로 남겨 가입에 붙인다.
    const src = q.get('utm_source') ?? (q.get('gclid') ? 'gads' : null), camp = q.get('utm_campaign'), term = q.get('utm_term')
    const send = () => {
      if (document.visibilityState !== 'visible') return
      void fetch('/api/presence', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, src, ref, camp, term }) }).catch(() => {})
    }
    // 11/18 탭을 닫거나 다른 사이트로 나감 — 관리자 현황에서 바로 오프라인으로.
    const leave = () => { navigator.sendBeacon?.('/api/presence', new Blob([JSON.stringify({ leave: true })], { type: 'application/json' })) }
    send()
    const timer = setInterval(send, 45_000)
    document.addEventListener('visibilitychange', send)
    window.addEventListener('pagehide', leave)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', send); window.removeEventListener('pagehide', leave) }
  }, [path])
  return null
}
