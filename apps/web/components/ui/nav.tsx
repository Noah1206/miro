'use client'
import { motion } from 'motion/react'
import { usePathname } from 'next/navigation'
import { spring } from '@/lib/motion/tokens'
import { TransitionLink } from './transition-link'

const ITEMS = [
  { href: '/home', label: '홈', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { href: '/archive', label: '인연', icon: <path d="M4 5h16v11H9l-5 4z" /> },
  { href: '/create', label: '만들기', icon: <path d="M12 5v14M5 12h14" /> },
  { href: '/my', label: '나', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></> },
]

/**
 * 조용한 내비게이션. 활성 = 흰색, 비활성 = 회색, Accent 없음.
 * 모바일: 하단. 데스크톱(≥1024): 왼쪽 세로. 활성 표시는 하나의 점이 이동한다(layoutId).
 * Chat / Live / Call 처럼 장면이 화면을 채우는 곳에서는 사라진다.
 */
export function Nav() {
  const pathname = usePathname()
  if (/^\/(chat|live|call)\//.test(pathname)) return null
  return (
    <nav aria-label="주요" className="nav">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + '/')
        return (
          <TransitionLink key={it.href} href={it.href} aria-current={active ? 'page' : undefined} className="nav__item" style={{ color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
            <span className="nav__inner">
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
              <span style={{ fontSize: 'var(--font-caption)', letterSpacing: 0 }}>{it.label}</span>
              {active && <motion.span aria-hidden layoutId="nav-dot" transition={spring.default} style={{ position: 'absolute', top: -8, width: 4, height: 4, borderRadius: 2, background: 'var(--color-white)' }} />}
            </span>
          </TransitionLink>
        )
      })}
    </nav>
  )
}
