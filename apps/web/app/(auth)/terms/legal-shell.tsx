import type { ReactNode } from 'react'
import { Back, TransitionLink } from '@/components/ui'
import { SiteFooter } from '@/components/site-footer'
import { LEGAL_TITLES, type LegalKey } from '@/lib/legal'
import { getT } from '@/lib/i18n/server'
import styles from './legal.module.css'

/** 왼쪽 목록의 문서 — 바닥글과 같은 순서에 개정 안내를 더한다. */
const DOCS: Array<{ key: LegalKey | 'revisions'; href: string }> = [
  ...(['service', 'privacy', 'refund', 'ai', 'adult'] as const).map((key) => ({ key, href: `/terms/${key}` })),
  { key: 'revisions', href: '/terms/revisions' },
]

/**
 * 약관·정책 화면의 틀(2026-10-09 요청: X 고객센터 정책 페이지와 같은 배치).
 * 넓은 화면: 왼쪽 문서 목록 · 가운데(경로 → 회색 띠의 큰 제목 → 본문) · 오른쪽 이 문서의 목차.
 * 좁은 화면: 목록은 위에서 옆으로 넘기는 줄, 목차는 숨긴다.
 */
export async function LegalShell({ current, title, back, toc, children }: {
  current: LegalKey | 'revisions'
  title: string
  back: string
  toc: Array<{ id: string; title: string }>
  children: ReactNode
}) {
  const t = await getT()
  const label = (key: LegalKey | 'revisions') => key === 'revisions' ? t('약관 개정 안내') : t(LEGAL_TITLES[key])
  const links = DOCS.map((d) => (
    <TransitionLink key={d.key} href={d.href} className={styles.docLink} aria-current={d.key === current ? 'page' : undefined}>{label(d.key)}</TransitionLink>
  ))
  return (
    <main id="main" tabIndex={-1} className={styles.shell}>
      <nav aria-label={t('약관과 정책')} className={styles.side}>
        <p className={styles.sideTitle}>
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></svg>
          {t('약관과 정책')}
        </p>
        <div className={styles.docList}>{links}</div>
      </nav>

      <div className={styles.center}>
        <header className={styles.hero}>
          <div className={styles.crumbs}>
            <Back href={back} />
            <ol>
              <li><TransitionLink href="/home">MIRO</TransitionLink></li>
              <li>{t('약관과 정책')}</li>
              <li aria-current="page">{title}</li>
            </ol>
          </div>
          <h1 className={styles.title}>{title}</h1>
        </header>
        <nav aria-label={t('약관과 정책')} className={styles.mobileDocs}>{links}</nav>
        <div className={styles.body}>{children}</div>
        <SiteFooter style={{ marginTop: 0 }} />
      </div>

      <aside className={styles.toc}>
        {toc.length > 0 && (
          <nav aria-label={t('이 문서의 목차')}>
            <p className={styles.tocTitle}>{title}</p>
            <ol>{toc.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}</ol>
          </nav>
        )}
      </aside>
    </main>
  )
}
