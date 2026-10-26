import type { ReactNode } from 'react'
import { TransitionLink } from '@/components/ui'
import styles from './my.module.css'
import { ProfileIcon, type ProfileIconName } from './profile-icon'

/** One named group of related profile destinations. */
export function MenuSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section className={styles.menu} id={id} aria-label={title}><h2 className={styles.menuTitle}>{title}</h2><div className={styles.menuItems}>{children}</div></section>
}

export function MenuItemContent({ label, sub, end, icon }: { label: string; sub?: string; end?: string; icon?: ProfileIconName }) {
  return <>
    {icon && <span className={styles.rowIcon}><ProfileIcon name={icon} /></span>}
    <span className={styles.rowCopy}><span className={styles.rowLabel}>{label}</span>{sub && <span className={styles.rowSub}>{sub}</span>}</span>
    {end && <span className={styles.rowEnd}>{end}</span>}
    <span className={styles.chevron}><ProfileIcon name="chevron" size={16} /></span>
  </>
}

/** Shared grouped navigation row; email links keep their native action. */
export function MenuRow({ href, label, sub, end, icon }: { href: string; label: string; sub?: string; end?: string; icon?: ProfileIconName }) {
  const inner = <MenuItemContent label={label} sub={sub} end={end} icon={icon} />
  if (href.startsWith('mailto:')) return <a href={href} className={styles.row}>{inner}</a>
  return <TransitionLink href={href} className={styles.row}>{inner}</TransitionLink>
}
