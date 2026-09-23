'use client'
import { usePathname } from 'next/navigation'
import { TransitionLink } from './transition-link'
import { useLoginSheet } from './login-sheet'

/**
 * 만들기가 한가운데 — 다섯 칸의 중심이 '새로 만드는 일' 이다 (레퍼런스).
 *
 * 아이콘은 선이 아니라 꽉 찬 실루엣이다. 속(나침반 바늘·플러스·말풍선 점)은 같은 path 안의
 * 하위 도형으로 두고 fill-rule=evenodd 로 뚫는다 — 배경색으로 덮으면 내비의 반투명 블러와
 * 어긋나므로, 진짜 구멍을 내서 뒤가 그대로 비치게 한다.
 */
const ITEMS = [
  { href: '/home', label: '홈',
    icon: <path d="M10.9 3.2 3.6 9.6a2.4 2.4 0 0 0-.8 1.8v8.1A1.5 1.5 0 0 0 4.3 21h15.4a1.5 1.5 0 0 0 1.5-1.5v-8.1a2.4 2.4 0 0 0-.8-1.8l-7.3-6.4a1.7 1.7 0 0 0-2.2 0z" /> },
  /**
   * 미로 — Reality 인터랙션을 가진, 중심이 되는 캐릭터들이 모인 곳. 캐릭터 카드가 겹겹이 쌓인 모양이다.
   * 나침반(탐색)도, 별(장식)도, 빈 고리도 아니다 — 이 탭에 실제로 있는 것, 캐릭터들을 가리킨다.
   *
   * 겹친 자리는 evenodd 로 뚫려 틈이 된다. 배경색으로 덮지 않으므로 내비의 반투명 블러가
   * 그대로 비치고, 그 틈 덕에 한 덩어리가 아니라 '여러 장' 으로 읽힌다.
   */
  { href: '/miro', label: '미로',
    icon: <path d="M10.8 2.6h7.2a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4h-7.2a3.4 3.4 0 0 1-3.4-3.4V6a3.4 3.4 0 0 1 3.4-3.4ZM6 7.4h7.2a3.4 3.4 0 0 1 3.4 3.4v7.2a3.4 3.4 0 0 1-3.4 3.4H6a3.4 3.4 0 0 1-3.4-3.4v-7.2A3.4 3.4 0 0 1 6 7.4Z" /> },
  // 만들기도 로그인 뒤에만 의미가 있다 — 비로그인이면 로그인 화면으로 보내지 않고 대화·나처럼 시트로 묻는다.
  { href: '/create', label: '만들기', auth: true,
    icon: <path d="M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8zm1 5.4a1 1 0 0 0-2 0v3H8a1 1 0 0 0 0 2h3v3a1 1 0 0 0 2 0v-3h3a1 1 0 0 0 0-2h-3z" /> },
  { href: '/archive', label: '대화', auth: true,
    icon: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.6-.7L4 21l1.3-3.9A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5zM7.6 11.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0zm3.8 0a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 0 0-2.2 0z" /> },
  // 머리가 크고 어깨에 바로 붙는다 (레퍼런스). 둘이 겹치므로 여기만 nonzero — evenodd 면 겹친 자리가 뚫린다.
  { href: '/my', label: '나', auth: true,
    icon: <g fillRule="nonzero"><circle cx="12" cy="8.9" r="6.4" /><path d="M12 14.8c-5.2 0-9.4 2.9-9.4 6.1 0 .3.2.5.5.5h17.8c.3 0 .5-.2.5-.5 0-3.2-4.2-6.1-9.4-6.1z" /></g> },
]

/**
 * 조용한 내비게이션. 아이콘은 늘 꽉 찬 실루엣이고 색만 바뀐다 — 활성 = 주황, 비활성 = 회색.
 * 배경·점 없음. Chat / Live / Call 처럼 장면이 화면을 채우는 곳에서는 사라진다.
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
        const inner = (
            <span className="nav__inner">
              {/* 현재 페이지 = 아이콘 몸통만 주황으로 채워진다 (밝은 쪽, 어두운 바탕 5.5:1). 윤곽선은 긋지 않는다. */}
              {/* 아이콘 : 라벨 ≈ 2.4 : 1 — 아이콘이 이끌고 라벨은 따라붙는다 (레퍼런스 실측). */}
              <svg aria-hidden width="32" height="32" viewBox="0 0 24 24" fill={active ? 'var(--color-accent-text)' : 'currentColor'} fillRule="evenodd" clipRule="evenodd">
                {it.icon}
              </svg>
              <span style={{ fontSize: 'var(--font-caption)', lineHeight: 1.3, letterSpacing: 0 }}>{it.label}</span>
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
