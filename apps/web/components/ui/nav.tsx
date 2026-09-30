'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TransitionLink } from './transition-link'
import { useLoginSheet } from './login-sheet'
import { CreateNavSheet } from './create-nav-sheet'
import { CREATE_CHARACTER_OPTIONS, createHref } from '@/lib/create-character-types'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

/**
 * 탭은 미로 · 만들기 · 대화 · 나 넷이다(2026-09-30: 첫 베타는 미로 캐릭터만 — 홈 탭 이름을 '미로' 로 바꾸고 따로 있던 미로 탭은 뺐다).
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
  // 만들기도 로그인 뒤에만 의미가 있다 — 비로그인이면 로그인 화면으로 보내지 않고 대화·나처럼 시트로 묻는다.
  { href: '/create', label: msg('만들기'), auth: true,
    icon: <path d="M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8zm1 5.4a1 1 0 0 0-2 0v3H8a1 1 0 0 0 0 2h3v3a1 1 0 0 0 2 0v-3h3a1 1 0 0 0 0-2h-3z" /> },
  { href: '/archive', label: msg('대화'), auth: true,
    icon: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.7L4 21l1.3-3.9A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5zM7.6 11.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0z" /> },
  // 머리가 크고 어깨에 바로 붙는다 (레퍼런스). 둘이 겹치므로 여기만 nonzero — evenodd 면 겹친 자리가 뚫린다.
  { href: '/my', label: msg('나'), auth: true,
    icon: <g fillRule="nonzero"><circle cx="12" cy="8.9" r="6.4" /><path d="M12 14.8c-5.2 0-9.4 2.9-9.4 6.1 0 .3.2.5.5.5h17.8c.3 0 .5-.2.5-.5 0-3.2-4.2-6.1-9.4-6.1z" /></g> },
]

/**
 * 조용한 내비게이션. 아이콘은 늘 꽉 찬 실루엣이고 색만 바뀐다 — 활성 = 주황, 비활성 = 회색.
 * 배경·점 없음. Chat / Live / Call 처럼 장면이 화면을 채우는 곳에서는 사라진다.
 */
export function Nav({ signedIn = true, userId = null }: { signedIn?: boolean; userId?: string | null }) {
  const pathname = usePathname()
  const t = useT()
  const askLogin = useLoginSheet()
  const router = useRouter()
  // 만들기는 시트에서 유형을 고른다. 고를 게 하나뿐이면(첫 베타: 미로 캐릭터만) 시트 없이 바로 편집기로 간다(2026-09-30).
  const choosing = CREATE_CHARACTER_OPTIONS.length > 1
  const [createOpen, setCreateOpen] = useState(false)
  const openCreate = (id: string) => choosing ? setCreateOpen(true) : router.push(createHref(id, CREATE_CHARACTER_OPTIONS[0]!.type))
  if (/^\/create(?:\/|$)/.test(pathname) || /^\/(chat|messages|live|call)\//.test(pathname) || /^\/character\/[^/]+$/.test(pathname)) return null
  return (
    <><nav aria-label={t('주요')} className="nav">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + '/')
        // 로그인이 필요한 탭은 비로그인일 때 시트로 묻는다 — 보던 화면을 떠나지 않는다.
        const gated = !signedIn && it.auth
        const inner = (
            <span className="nav__inner">
              {/* 현재 페이지 = 아이콘과 라벨이 흰색, 나머지는 회색. 주황은 쓰지 않는다 — 내비는 자리를 알릴 뿐 포인트가 아니다. */}
              {/* 아이콘 22 : 라벨 11 = 2 : 1 — 아이콘이 이끌고 라벨은 따라붙는다. 바가 56 으로 낮아지며 같이 줄였다(2026-09-29). */}
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
                {it.icon}
              </svg>
              <span style={{ fontSize: 'var(--font-micro)', lineHeight: 1.2, letterSpacing: 0 }}>{t(it.label)}</span>
            </span>
        )
        const style = { color: active ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }
        return gated ? (
          <button key={it.href} type="button" className="nav__item" data-auth-gate={it.href} style={style}
            onClick={() => askLogin(it.href)}>{inner}</button>
        ) : it.href === '/create' && userId ? (
          <button key={it.href} type="button" className="nav__item" aria-haspopup={choosing ? 'dialog' : undefined} aria-expanded={choosing ? createOpen : undefined}
            onClick={() => openCreate(userId)} style={style}>{inner}</button>
        ) : (
          <TransitionLink key={it.href} href={it.href} prefetch={true} aria-current={active ? 'page' : undefined} className="nav__item" style={style}>
            {inner}
          </TransitionLink>
        )
      })}
    </nav>
    {userId && choosing && <CreateNavSheet open={createOpen} onClose={() => setCreateOpen(false)} userId={userId} />}
    </>
  )
}
