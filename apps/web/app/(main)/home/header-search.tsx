'use client'
import { TransitionLink } from '@/components/ui'

/**
 * 11/20 홈 헤더 돋보기 — 검색 화면으로, 입력칸 포커스.
 * 아이폰 사파리는 누른 순간(사용자 동작 안)에 포커스한 입력칸에만 키보드를 올린다. 그래서 누를 때 화면 밖 임시 칸에 먼저 포커스해
 * 키보드를 올려 두고, 검색 화면의 입력칸이 그 포커스를 이어받는다(임시 칸은 곧 지운다).
 */
export function HeaderSearch({ label, className }: { label: string; className?: string }) {
  return (
    <TransitionLink href="/search" aria-label={label} className={className} style={{ display: 'grid', placeItems: 'center', color: 'var(--color-white)' }}
      onClick={() => {
        const bridge = document.createElement('input')
        bridge.setAttribute('aria-hidden', 'true')
        bridge.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none'
        document.body.appendChild(bridge)
        bridge.focus()
        setTimeout(() => bridge.remove(), 3000)
      }}>
      <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
    </TransitionLink>
  )
}
