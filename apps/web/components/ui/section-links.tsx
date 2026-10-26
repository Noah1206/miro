import { TransitionLink } from './transition-link'
import styles from './section-tabs.module.css'

/** Equal-width page sections; route links retain normal link and keyboard navigation. */
export function SectionLinks({ items, active, label, fullBleed = false, className = '' }: {
  items: Array<{ key: string; label: string; href: string }>; active: string; label: string; fullBleed?: boolean; className?: string
}) {
  return <nav aria-label={label} className={`${styles.bar} ${fullBleed ? styles.fullBleed : ''} ${className}`}>
    {items.map(item => <TransitionLink key={item.key} href={item.href} aria-current={item.key === active ? 'page' : undefined} className={styles.item}>{item.label}</TransitionLink>)}
  </nav>
}
