import type { ReactNode } from 'react'
import { TransitionLink } from '@/components/ui'
import styles from './my.module.css'

/** '나' 화면 아래 메뉴 묶음 — 작은 회색 제목 + 글자만 있는 줄(설정 페이지를 옮겨 왔다, 2026-10-01). */
export function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.menu}><h2 className={styles.menuTitle}>{title}</h2>{children}</section>
}

/** 글자 줄 하나. 메일 주소는 그냥 a 로 연다. */
export function MenuRow({ href, label, sub }: { href: string; label: string; sub?: string }) {
  const inner = <>
    <span className="t-body">{label}</span>
    {sub && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</span>}
  </>
  if (href.startsWith('mailto:')) return <a href={href} className={styles.row}>{inner}</a>
  return <TransitionLink href={href} className={styles.row}>{inner}</TransitionLink>
}
