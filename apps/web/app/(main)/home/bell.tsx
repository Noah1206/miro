'use client'
import { WELCOME_GRANT } from '@miro/config'
import { TransitionLink } from '@/components/ui'
import { useLoginSheet } from '@/components/ui/login-sheet'
import { useT } from '@/lib/i18n/client'
import styles from './home.module.css'

/**
 * 로그인 전 방문자에게 보이는 알림 숫자(2026-09-30 사용자 결정) — 실제 알림 수가 아니라 가입을 권하는 표시다.
 * 로그인하면 실제 안 읽은 연락 수로 바뀐다. 거짓 표시로 볼 여지가 있어 끄려면 null 로.
 */
const VISITOR_BADGE: string | null = '99+'

/** 검색 아이콘 상자와 같은 크기·선 굵기. */
const BOX = { position: 'relative', display: 'grid', placeItems: 'center', width: 38, height: 38, padding: 0, border: 0, background: 'none', color: 'var(--color-text-primary)', cursor: 'pointer' } as const

/**
 * 홈 헤더의 알림 종 — 검색과 로그인(또는 내 정보) 사이(2026-09-30 요청).
 * 빨간 숫자는 그 사용자의 실제 안 읽은 연락 수(unreadContactCount)이고, 0 이거나 로그인 전이면 숫자가 없다.
 * 누르면 방별 안 읽은 수가 보이는 대화 목록으로 — 로그인 전이면 로그인 시트를 연다.
 * 로그인 전에는 VISITOR_BADGE 숫자를 보이고(2026-09-30 사용자 결정), 누르면 뜨는 로그인 시트에 가입 선물 문구가 함께 뜬다.
 */
export function NotificationBell({ unread, signedIn, className }: { unread: number; signedIn: boolean; className?: string }) {
  const t = useT()
  const askLogin = useLoginSheet()
  // 11/12 사용자: 크랙처럼 얇은 회색 종 + 숫자 대신 작은 빨간 점(안 읽은 알림이 있을 때).
  const inner = <>
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 3.2c-3.6 0-6.4 2.8-6.4 6.3v4.2L4 17.3h16l-1.6-3.6V9.5c0-3.5-2.8-6.3-6.4-6.3Z" /><path d="M9.6 19.4a2.5 2.5 0 0 0 4.8 0" strokeLinecap="round" />
    </svg>
    {unread > 0 && <span className={styles.bellDot} aria-hidden />}
  </>
  if (!signedIn) return (
    <button type="button" aria-label={t('알림, 가입 선물이 기다리고 있어요')} className={className} style={BOX}
      onClick={() => askLogin(undefined, t('가입하면 {n} 미로 토큰을 선물로 드려요', { n: WELCOME_GRANT.units }))}>
      {inner}{VISITOR_BADGE && <span className={styles.bellDot} aria-hidden />}
    </button>
  )
  return (
    <TransitionLink href="/archive" aria-label={unread > 0 ? t('알림, 안 읽은 알림 {n}개', { n: unread }) : t('알림')} className={className} style={BOX}>
      {inner}
    </TransitionLink>
  )
}
