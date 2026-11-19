'use client'
import { useEffect, useState } from 'react'
import type { LoginProvider } from './social-button'
import { DesktopChats } from './desktop-chats'
import { usePathname } from 'next/navigation'
import { TransitionLink } from './transition-link'
import { useLoginSheet } from './login-sheet'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'
import glass from './nav-glass.module.css'

/**
 * 탭은 홈 · 탐색 · 만들기 · 대화 · 프로필 순서다.
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
  /** 11/7 사용자: '미로' → '홈', 집 모양 아이콘. 지붕+몸통 한 덩어리에 문을 evenodd 로 뚫는다. */
  { href: '/home', label: msg('홈'),
    icon: <path d="M11.2 2.9a1.3 1.3 0 0 1 1.6 0l8.4 6.7c.4.3.6.8.6 1.3v9.1c0 .9-.7 1.6-1.6 1.6H4c-.9 0-1.6-.7-1.6-1.6v-9.1c0-.5.2-1 .6-1.3l8.2-6.7ZM10 15.4v4.8h4v-4.8a2 2 0 0 0-4 0Z" /> },
  { href: '/explore', label: msg('탐색'),
    icon: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 5.4-2.8 6.4-6.4 2.8 2.8-6.4 6.4-2.8ZM12 10.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" /> },
  /** 만들기 — 둥근 사각형에 evenodd 로 뚫린 플러스. 10/28: '내가 만든 캐릭터' 화면으로 간다(사용자 요청). */
  { href: '/my/characters', label: msg('만들기'), auth: true,
    icon: <path d="M7 2.6h10A4.4 4.4 0 0 1 21.4 7v10a4.4 4.4 0 0 1-4.4 4.4H7A4.4 4.4 0 0 1 2.6 17V7A4.4 4.4 0 0 1 7 2.6Zm4 4.9v3.5H7.5v2H11v3.5h2V13h3.5v-2H13V7.5h-2Z" /> },
  { href: '/archive', label: msg('대화'), auth: true,
    icon: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.7L4 21l1.3-3.9A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5zM7.6 11.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0z" /> },
  // 머리가 크고 어깨에 바로 붙는다 (레퍼런스). 둘이 겹치므로 여기만 nonzero — evenodd 면 겹친 자리가 뚫린다.
  // 11/20 사용자: 프로필은 로그인 전에도 열린다(안에서 로그인 버튼).
  { href: '/my', label: msg('프로필'),
    icon: <g fillRule="nonzero"><circle cx="12" cy="8.9" r="6.4" /><path d="M12 14.8c-5.2 0-9.4 2.9-9.4 6.1 0 .3.2.5.5.5h17.8c.3 0 .5-.2.5-.5 0-3.2-4.2-6.1-9.4-6.1z" /></g> },
]

const SUB_PAGES = /^\/(explore|search|genre|persona|creators?|earnings|stories|recharge|archive\/delete)(?:\/|$)|^\/my\/(settings|language|permissions|ai-data|subscription|likes|delete)(?:\/|$)|^\/character\/[^/]+\/comments/

/**
 * 조용한 내비게이션. 아이콘은 늘 꽉 찬 실루엣이고 색만 바뀐다 — 활성 = 주황, 비활성 = 회색.
 * 배경·점 없음. Chat / Live / Call 처럼 장면이 화면을 채우는 곳에서는 사라진다.
 */
export function Nav({ signedIn = true, providers = [] }: { signedIn?: boolean; providers?: LoginProvider[] }) {
  const [collapsed, setCollapsed] = useState(false)
  // 보이는 화면(visualViewport)이 fixed 기준(innerHeight)보다 아래로 길면 그만큼 탭을 내린다. 키보드로 줄어들 땐 0(올리지 않음).
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const fit = () => root.style.setProperty('--vv-shift', `${Math.max(0, Math.round(vv.height + vv.offsetTop - window.innerHeight))}px`)
    // 11/20 사용자(iOS 크롬): 키보드가 닫히거나 화면을 옮긴 뒤 탭이 화면 한가운데 떠 있고 그 아래가 안 그려졌다 — iOS 는 키보드가 닫혀도
    // 크기 이벤트를 안 줄 때가 있어 fixed 기준이 키보드 열린 높이에 멈춘다. 입력칸에서 포커스가 빠지거나 화면이 바뀌면 닫히는 애니메이션이
    // 끝날 때쯤 몇 번 더 재고, 입력 중이 아니면 문서를 1px 건드렸다 되돌려 브라우저가 화면 크기를 다시 잡게 한다.
    const timers = new Set<number>()
    const editing = () => document.activeElement instanceof HTMLElement && document.activeElement.matches('input, textarea, [contenteditable]')
    const nudge = () => {
      fit()
      if (editing() || window.innerHeight >= vv.height * vv.scale - 1) return
      const y = window.scrollY
      window.scrollTo(0, y + 1); window.scrollTo(0, y); fit()
    }
    const settle = () => { for (const ms of [350, 800, 1500]) { const id = window.setTimeout(() => { timers.delete(id); nudge() }, ms); timers.add(id) } }
    const focusOut = (e: FocusEvent) => { if (e.target instanceof HTMLElement && e.target.matches('input, textarea, [contenteditable]')) settle() }
    const shown = () => { if (document.visibilityState === 'visible') settle() }
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); window.addEventListener('scroll', fit, { passive: true })
    window.addEventListener('resize', fit); window.addEventListener('orientationchange', settle); window.addEventListener('pageshow', settle)
    window.addEventListener('miro:viewport-settle', settle); document.addEventListener('focusout', focusOut); document.addEventListener('visibilitychange', shown)
    return () => {
      timers.forEach(clearTimeout)
      vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); window.removeEventListener('scroll', fit)
      window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', settle); window.removeEventListener('pageshow', settle)
      window.removeEventListener('miro:viewport-settle', settle); document.removeEventListener('focusout', focusOut); document.removeEventListener('visibilitychange', shown)
    }
  }, [])
  const pathname = usePathname()
  // 화면이 바뀔 때마다 한 번 더 잰다 — 키보드가 열린 채 나온 화면(채팅·검색)의 높이가 다음 화면에 남지 않게.
  useEffect(() => { window.dispatchEvent(new Event('miro:viewport-settle')) }, [pathname])
  const t = useT()
  const askLogin = useLoginSheet()
  const activePath = /^\/search(?:\/|$)/.test(pathname) ? '/explore' : pathname
  const activeIndex = ITEMS.findIndex(item => activePath === item.href || activePath.startsWith(item.href + '/'))
  // 11/3: 채팅방·문자(DM)방은 컴퓨터에서 왼쪽 채팅 사이드바만 둔다(하단 탭은 입력창과 겹쳐서 계속 숨김). 휴대폰에서 사이드바는 CSS 로 안 보인다.
  // 11/4: 캐릭터 상세도 컴퓨터에서는 왼쪽 대화 목록을 띄운다(휴대폰은 화면 폭 때문에 숨겨진다).
  if (/^\/(chat|messages)\//.test(pathname) || /^\/character\/[^/]+$/.test(pathname)) return <DesktopChats signedIn={signedIn} providers={providers} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />
  if (/^\/create(?:\/|$)/.test(pathname) || /^\/(chat|messages|live|call)\//.test(pathname) || /^\/character\/[^/]+$/.test(pathname) || /^\/stories\/play\//.test(pathname)) return null
  // 11/20 사용자: 하단 탭은 탭의 첫 화면(홈·대화·만들기·프로필)에만 — 한 단계 들어간 화면은 위쪽 화살표로 돌아간다. 컴퓨터의 왼쪽 대화 목록은 그대로.
  // 뒤로 화살표가 있는 화면만 적는다(없는 화면에서 탭까지 빼면 나갈 길이 없다).
  if (SUB_PAGES.test(pathname)) return <DesktopChats signedIn={signedIn} providers={providers} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />
  return (
    // 대화 탭은 목록이 곧 사이드바 내용이라 데스크톱 사이드바를 두지 않는다(10/28).
    <>{!/^\/archive(?:\/|$)/.test(pathname) && <DesktopChats signedIn={signedIn} providers={providers} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />}<nav aria-label={t('주요')} className={`nav ${glass.bar}`}>
      {activeIndex >= 0 && <span aria-hidden="true" className={glass.indicator} style={{ transform: `translateX(${activeIndex * 100}%)` }} />}
      {ITEMS.map((it) => {
        const active = ITEMS[activeIndex] === it  // /my/characters 에서 프로필(/my)까지 켜지지 않게 한 칸만.
        // 로그인이 필요한 탭은 비로그인일 때 시트로 묻는다 — 보던 화면을 떠나지 않는다.
        const gated = !signedIn && it.auth
        const inner = (
            <span className="nav__inner">
              {/* 현재 페이지 = 아이콘과 라벨이 흰색, 나머지는 회색. 주황은 쓰지 않는다 — 내비는 자리를 알릴 뿐 포인트가 아니다. */}
              {/* 아이콘 22 : 라벨 11 = 2 : 1 — 아이콘이 이끌고 라벨은 따라붙는다. 바가 56 으로 낮아지며 같이 줄였다(2026-09-29). */}
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
                {it.icon}
              </svg>
              {/* 10/28: 아이콘 아래 탭 이름(다시 보이게). */}
              <span style={{ fontSize: 'var(--font-micro)', lineHeight: 1.2, letterSpacing: 0, marginTop: 3 }}>{t(it.label)}</span>
            </span>
        )
        const style = { color: 'var(--color-text-primary)' }
        return gated ? (
          <button key={it.href} type="button" className="nav__item" data-auth-gate={it.href} style={style} data-create={it.href === '/my/characters' || undefined}
            onClick={() => askLogin(it.href)}>{inner}</button>
        ) : (
          <TransitionLink key={it.href} href={it.href} prefetch={true} aria-current={active ? 'page' : undefined} className="nav__item" style={style} data-create={it.href === '/my/characters' || undefined}>
            {inner}
          </TransitionLink>
        )
      })}
    </nav></>
  )
}
