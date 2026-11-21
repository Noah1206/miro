import { msg } from '@/lib/i18n'

/**
 * 탭은 홈 · 탐색 · 만들기 · 대화 · 프로필 순서다. 하단 내비와 데스크톱 사이드바(11/21)가 같은 목록을 쓴다.
 *
 * 아이콘은 선이 아니라 꽉 찬 실루엣이다. 속(플러스·말풍선 점)은 같은 path 안의
 * 하위 도형으로 두고 fill-rule=evenodd 로 뚫는다 — 배경색으로 덮으면 내비의 반투명 블러와
 * 어긋나므로, 진짜 구멍을 내서 뒤가 그대로 비치게 한다.
 */
export const NAV_ITEMS = [
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

/** 지금 화면에 해당하는 탭 하나(/my/characters 에서 프로필(/my)까지 켜지지 않게 가장 앞의 하나만). 검색은 탐색으로. */
export function activeNavIndex(pathname: string) {
  const path = /^\/search(?:\/|$)/.test(pathname) ? '/explore' : pathname
  return NAV_ITEMS.findIndex(item => path === item.href || path.startsWith(item.href + '/'))
}
