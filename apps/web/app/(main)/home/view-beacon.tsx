'use client'
import { useEffect } from 'react'
import { usedVoice } from '@/lib/voice-used'

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

/**
 * 11/17 사용자: 홈에 들어오면 무조건 음성 서버를 깨운다 — 꺼져 있으면 첫 소리까지 약 50초, 켜져 있으면 3~6초(실측).
 * 음성 모드로 바꿨을 때 바로 소리가 나게, 방에 들어가기 전에 켜 둔다. 로그인한 사람만(서버가 회원당 5분에 한 번으로 막는다), 화면엔 아무것도 그리지 않는다.
 * 비용: 깨운 뒤 아무도 안 쓰면 25분 켜졌다 꺼진다(GPU 약 $2.5) — 사용자가 알고 정한 값(11/17).
 * 11/19 사용자: 음성 모드를 한 번이라도 켠 사람만 깨운다 — 음성을 안 쓰는 사람이 홈을 지날 때마다 GPU 가 켜지던 비용을 없앤다.
 * 켠 적 있는지는 이 브라우저의 표시로 본다(방별 음성 켬 miro:immersive:<방>, 첫 켬 안내 miro:voice-intro:<회원>).
 */

export function HomeVoiceWake() {
  useEffect(() => { if (usedVoice()) void fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wake: true }), keepalive: true }).catch(() => {}) }, [])
  return null
}
