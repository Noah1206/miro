'use client'
import { useEffect } from 'react'

/**
 * 홈 방문 기록(11/8 퍼널) — 탭을 열어 둔 동안 로그인 상태마다 한 번. 화면엔 아무것도 그리지 않는다.
 * 11/12: 주소의 utm_source 를 함께 보낸다(채널별 유입). 로그인 뒤 한 번 더 보내야 익명 ID 와 계정이 이어진다.
 */
export function HomeViewBeacon({ signedIn }: { signedIn: boolean }) {
  useEffect(() => {
    const state = signedIn ? '1' : '0'
    try { if (sessionStorage.getItem('miro_home_viewed') === state) return; sessionStorage.setItem('miro_home_viewed', state) } catch {}
    const src = new URLSearchParams(location.search).get('utm_source')
    navigator.sendBeacon?.(src ? `/api/home-view?src=${encodeURIComponent(src)}` : '/api/home-view')
  }, [signedIn])
  return null
}
