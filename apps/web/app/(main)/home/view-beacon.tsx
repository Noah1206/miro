'use client'
import { useEffect } from 'react'

/** 홈 방문 1회 기록(11/8 퍼널) — 탭을 열어 둔 동안 한 번만. 화면엔 아무것도 그리지 않는다. */
export function HomeViewBeacon() {
  useEffect(() => {
    try { if (sessionStorage.getItem('miro_home_viewed')) return; sessionStorage.setItem('miro_home_viewed', '1') } catch {}
    navigator.sendBeacon?.('/api/home-view')
  }, [])
  return null
}
