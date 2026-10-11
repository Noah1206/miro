'use client'
import { useT } from '@/lib/i18n/client'
import styles from './social-button.module.css'

export type SocialProviderId = 'google' | 'kakao'
export type LoginProvider = { id: SocialProviderId; label: string }

/** Shared social entry for both the login page and login sheet. */
export function SocialButton({ id, label, next }: LoginProvider & { next?: string | null }) {
  const t = useT()
  return <a href={`/api/auth/${id}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`}
    data-login-provider={id} className={`${styles.button} ${styles[id]}`}>
    <span className={styles.icon}><Icon id={id} /></span>
    <span>{t('{label}로 계속하기', { label: t(label) })}</span>
  </a>
}

function Icon({ id }: { id: SocialProviderId }) {
  if (id === 'google') return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
  )
  return <svg aria-hidden width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.2 4.6 6.6L5.5 21l4.5-3c.7.1 1.3.1 2 .1 5.5 0 10-3.6 10-8.1S17.5 3 12 3z"/></svg>
}
