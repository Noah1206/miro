'use client'
import { useState } from 'react'
import type { LoginProvider } from './social-button'
import { DesktopChats } from './desktop-chats'
import { usePathname } from 'next/navigation'
import { TransitionLink } from './transition-link'
import { useLoginSheet } from './login-sheet'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import glass from './nav-glass.module.css'

/**
 * 탭은 미로 · 탐색 · 만들기 · 대화 · 프로필 순서다.
 *
 * 아이콘은 선이 아니라 꽉 찬 실루엣이다. 속(플러스·말풍선 점)은 같은 path 안의
 * 하위 도형으로 두고 fill-rule=evenodd 로 뚫는다 — 배경색으로 덮으면 내비의 반투명 블러와
 * 어긋나므로, 진짜 구멍을 내서 뒤가 그대로 비치게 한다.
 */
const ITEMS = [
  /**
   * 미로 — 첫 화면(홈). 캐릭터 카드가 겹겹이 쌓인 모양이다.
   * 겹친 자리는 evenodd 로 뚫려 틈이 된다. 그 틈 덕에 한 덩어리가 아니라 '여러 장' 으로 읽힌다.
   */
  { href: '/home', label: msg('미로'),
    icon: <path d="M10.8 2.6h7.2a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-7.2a3.4 3.4 0 0 1-3.4-3.4V6a3.4 3.4 0 0 1 3.4-3.4ZM6 7.4h7.2a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4H6a3.4 3.4 0 0 1-3.4-3.4v-7.2A3.4 3.4 0 0 1 6 7.4Z" /> },
  { href: '/explore', label: msg('탐색'),
    icon: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 5.4-2.8 6.4-6.4 2.8 2.8-6.4 6.4-2.8ZM12 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" /> },
  /** 만들기 — 둥근 사각형에 evenodd 로 뚫린 플러스. */
  { href: '/create', label: msg('만들기'), auth: true,
    icon: <path d="M7 2.6h10A4.4 4.4 0 0 1 21.4 7v10a4.4 4.4 0 0 1-4.4 4.4H7A4.4 4.4 0 0 1 2.6 17V7A4.4 4.4 0 0 1 7 2.6Zm4 4.9v3.5H7.5v2H11v3.5h2V13h3.5v-2H13V7.5h-2Z" /> },
  { href: '/archive', label: msg('대화'), auth: true,
    icon: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.7L4 21l1.3-3.9A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5zM7.6 11.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0z" /> },
  // 머리가 크고 어깨에 바로 붙는다 (레퍼런스). 둘이 겹치므로 여기만 nonzero — evenodd 면 겹친 자리가 뚫린다.
  { href: '/my', label: msg('프로필'), auth: true,
    icon: <g fillRule="nonzero"><circle cx="12" cy="8.9" r="6.4" /><path d="M12 14.8c-5.2 0-9.4 2.9-9.4 6.1 0 .3.2.5.5.5h17.8c.3 0 .5-.2.5-.5 0-3.2-4.2-6.1-9.4-6.1z" /></g> },
]

/**
 * 조용한 내비게이션. 아이콘은 늘 꽉 찬 실루엣이고 색만 바뀐다 — 활성 = 주황, 비활성 = 회색.
 * 배경·점 없음. Chat / Live / Call 처럼 장면이 화면을 채우는 곳에서는 사라진다.
 */
export function Nav({ signedIn = true, providers = [] }: { signedIn?: boolean; providers?: LoginProvider[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const t = useT()
  const askLogin = useLoginSheet()
  const activePath = /^\/search(?:\/|$)/.test(pathname) ? '/explore' : pathname
  const activeIndex = ITEMS.findIndex(item => activePath === item.href || activePath.startsWith(item.href + '/'))
  if (/^\/create(?:\/|$)/.test(pathname) || /^\/(chat|messages|live|call)\//.test(pathname) || /^\/character\/[^/]+$/.test(pathname) || /^\/stories\/play\//.test(pathname)) return null
  return (
    <><DesktopChats signedIn={signedIn} providers={providers} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} /><nav aria-label={t('주요')} className={`nav ${glass.bar}`}>
      {activeIndex >= 0 && <span aria-hidden="true" className={glass.indicator} style={{ transform: `translateX(${activeIndex * 100}%)` }} />}
      {ITEMS.map((it) => {
        const active = activePath === it.href || activePath.startsWith(it.href + '/')
        // 로그인이 필요한 탭은 비로그인일 때 시트로 묻는다 — 보던 화면을 떠나지 않는다.
        const gated = !signedIn && it.auth
        const inner = (
            <span className="nav__inner">
              {/* 현재 페이지 = 아이콘과 라벨이 흰색, 나머지는 회색. 주황은 쓰지 않는다 — 내비는 자리를 알릴 뿐 포인트가 아니다. */}
              {/* 아이콘 22 : 라벨 11 = 2 : 1 — 아이콘이 이끌고 라벨은 따라붙는다. 바가 56 으로 낮아지며 같이 줄였다(2026-09-29). */}
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
                {it.icon}
              </svg>
              {/* 10/28 스크린샷 요청: 아이콘만 보이는 알약 바 — 이름은 화면 읽기용으로만 남긴다. */}
              <span className="sr-only">{t(it.label)}</span>
            </span>
        )
        const style = { color: 'var(--color-text-primary)' }
        return gated ? (
          <button key={it.href} type="button" className="nav__item" data-auth-gate={it.href} style={style} data-create={it.href === '/create' || undefined}
            onClick={() => askLogin(it.href)}>{inner}</button>
        ) : (
          <TransitionLink key={it.href} href={it.href} prefetch={true} aria-current={active ? 'page' : undefined} className="nav__item" style={style} data-create={it.href === '/create' || undefined}>
            {inner}
          </TransitionLink>
        )
      })}
    </nav></>
  )
}
