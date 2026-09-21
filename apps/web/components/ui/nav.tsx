'use client'
import { usePathname } from 'next/navigation'
import { TransitionLink } from './transition-link'
import { useLoginSheet } from './login-sheet'

/** 만들기가 한가운데 — 다섯 칸의 중심이 '새로 만드는 일' 이다 (레퍼런스). */
const ITEMS = [
  { href: '/home', label: '홈', icon: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { href: '/miro', label: '미로', icon: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></> },
  { href: '/create', label: '만들기', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></> },
  { href: '/archive', label: '대화', auth: true, icon: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.7L4 21l1.3-3.9A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" /> },
  { href: '/my', label: '나', auth: true, icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></> },
]

/**
 * 조용한 내비게이션. 활성 = 아이콘 뒤 주황 알약 채움 + 흰 아이콘, 비활성 = 회색.
 * Chat / Live / Call 처럼 장면이 화면을 채우는 곳에서는 사라진다.
 */
export function Nav({ signedIn = true }: { signedIn?: boolean }) {
  const pathname = usePathname()
  const askLogin = useLoginSheet()
  if (/^\/(chat|live|call)\//.test(pathname) || /^\/character\/[^/]+$/.test(pathname)) return null
  return (
    <nav aria-label="주요" className="nav">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + '/')
        // 로그인이 필요한 탭은 비로그인일 때 시트로 묻는다 — 보던 화면을 떠나지 않는다.
        const gated = !signedIn && it.auth
        const filled = active && (it.href === '/home' || it.href === '/archive' || it.href === '/my')
        const inner = (
            <span className="nav__inner">
              {/* 현재 페이지 = 아이콘 뒤가 주황으로 채워진다. 점 이동 대신 자리 자체가 켜진다. */}
              <span aria-hidden style={{
                display: 'grid', placeItems: 'center', width: 46, height: 26, borderRadius: 13,
                background: active ? 'var(--color-accent)' : 'transparent',
                transition: 'background var(--motion-fast) var(--ease-standard)',
              }}>
                <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill={filled ? 'var(--color-accent-on)' : 'none'} stroke={active ? 'var(--color-accent-on)' : 'currentColor'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  {active && it.href === '/my'
                    ? <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0z" /></>
                    : it.icon}
                </svg>
              </span>
              <span style={{ fontSize: 'var(--font-caption)', letterSpacing: 0 }}>{it.label}</span>
            </span>
        )
        const style = { color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }
        return gated ? (
          <button key={it.href} type="button" className="nav__item" data-auth-gate={it.href} style={style}
            onClick={() => askLogin(it.href)}>{inner}</button>
        ) : (
          <TransitionLink key={it.href} href={it.href} prefetch={true} aria-current={active ? 'page' : undefined} className="nav__item" style={style}>
            {inner}
          </TransitionLink>
        )
      })}
    </nav>
  )
}
