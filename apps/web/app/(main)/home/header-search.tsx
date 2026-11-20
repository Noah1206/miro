'use client'
import { TransitionLink, useLoginSheet } from '@/components/ui'

/**
 * 11/20 홈 헤더 돋보기 — 검색 화면으로, 입력칸 포커스.
 * 아이폰 사파리는 누른 순간(사용자 동작 안)에 포커스한 입력칸에만 키보드를 올린다. 그래서 누를 때 화면 밖 임시 칸에 먼저 포커스해
 * 키보드를 올려 두고, 검색 화면의 입력칸이 그 포커스를 이어받는다(임시 칸은 곧 지운다).
 */
export function HeaderSearch({ label, className, signedIn }: { label: string; className?: string; signedIn: boolean }) {
  const askLogin = useLoginSheet()
  const icon = <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
  // 11/20 로그인 전엔 검색 화면이 홈으로 돌려보낸다(11/8 성인 서비스 규칙, 검색 API 도 로그인 필요) — 누르면 로그인 시트, 로그인 뒤 검색 화면으로.
  if (!signedIn) return <button type="button" aria-label={label} className={className} onClick={() => askLogin('/search')}
    style={{ display: 'grid', placeItems: 'center', border: 0, padding: 0, background: 'transparent', color: 'var(--color-white)', cursor: 'pointer' }}>{icon}</button>
  return (
    <TransitionLink href="/search" aria-label={label} className={className} style={{ display: 'grid', placeItems: 'center', color: 'var(--color-white)' }}
      onClick={() => {
        const bridge = document.createElement('input')
        bridge.setAttribute('aria-hidden', 'true')
        bridge.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none'
        document.body.appendChild(bridge)
        bridge.focus()
        // 검색 화면이 포커스를 가져가지 못했으면(이동 실패) 키보드를 내리고 지운다.
        setTimeout(() => { if (document.activeElement === bridge) bridge.blur(); bridge.remove() }, 2500)
      }}>
      {icon}
    </TransitionLink>
  )
}
