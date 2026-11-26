'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { LogoMark, TransitionLink } from '@/components/ui'
import { HeaderWallet } from '@/components/header-wallet'
import { ThemeToggle } from '@/components/theme-toggle'
import { useT } from '@/lib/i18n/client'

/** 헤더를 스스로 고정해 둔 장면 화면(채팅·문자·만들기·작품 상세·스토리 플레이) — 여기는 건드리지 않는다(nav.tsx 와 같은 목록). */
const SCENE = /^\/create(?:\/|$)|^\/(chat|messages|live|call)\/|^\/character\/[^/]+$|^\/stories\/play\//

/**
 * 11/27 사용자: 휴대폰에서 헤더는 늘 위에 고정. 화면에 헤더가 있으면 그 헤더를 고정하고, 없으면 이 공통 헤더(로고·잔액·테마·검색)를 넣는다.
 * 흐름 안에 sticky 로 두어 헤더 높이만큼 본문이 자연히 내려간다. 컴퓨터(1024px 이상)에서는 아무것도 하지 않는다(globals.css 가 숨긴다).
 * ponytail: 화면이 그려진 뒤 DOM 에서 header 를 찾는다(바로 + 0.6초 뒤 한 번 더). 늦게 뜨는 화면이 많아지면 화면마다 명시하게 바꾼다.
 */
export function MobileHeader({ signedIn }: { signedIn: boolean }) {
  const t = useT()
  const pathname = usePathname()
  const self = useRef<HTMLDivElement>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    setMissing(false)
    if (SCENE.test(pathname) || !matchMedia('(max-width: 1023px)').matches) return
    const check = () => {
      const header = self.current?.parentElement?.querySelector<HTMLElement>('header:not([data-mobile-header])')
      if (!header) { setMissing(true); return }
      setMissing(false)
      if (getComputedStyle(header).position === 'static') Object.assign(header.style, { position: 'sticky', top: '0', zIndex: '20', background: 'var(--color-bg)' })
    }
    check()
    const id = setTimeout(check, 600)
    return () => clearTimeout(id)
  }, [pathname])
  return (
    <div ref={self} className="mobile-header-slot">
      {missing && <header data-mobile-header className="mobile-header">
        <TransitionLink href="/home" aria-label={t('홈')} style={{ display: 'flex', alignItems: 'center' }}><LogoMark size={24} /></TransitionLink>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          {signedIn && <HeaderWallet />}
          <ThemeToggle />
          <TransitionLink href="/search" aria-label={t('검색')} style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, color: 'var(--color-text-primary)' }}>
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </TransitionLink>
        </div>
      </header>}
    </div>
  )
}
