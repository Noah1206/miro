import type { ReactNode } from 'react'
import { Back, Page } from './page'
import styles from './settings-page.module.css'

/** Compact profile settings, with the same title hierarchy as the character library. */
export function SettingsPage({ title, back = '/my', children }: { title: string; back?: string; children: ReactNode }) {
  return <Page className={styles.page}>
    <header className={styles.header}><Back href={back} /><h1>{title}</h1></header>
    {children}
  </Page>
}
