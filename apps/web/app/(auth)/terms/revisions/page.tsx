import type { Metadata } from 'next'
import { Back, Notice, Page, PageHeader, TransitionLink } from '@/components/ui'
import { SiteFooter } from '@/components/site-footer'
import { LEGAL_TITLES } from '@/lib/legal'
import { NOTICE_DAYS, REVISIONS, kstDate } from '@/lib/legal/revisions'
import { getT } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> { const t = await getT(); return { title: t('약관 개정 안내') } }

/**
 * 약관·처리방침 개정 안내(2026-10-05) — 공지일·시행일·바뀌기 전과 후를 조항별로 보인다(약관 제3조 ③·④, 처리방침 16항).
 * 시행 전 개정은 '예정', 시행된 개정은 '시행됨'으로 남겨 두어 이력이 된다.
 */
export default async function RevisionsPage() {
  const t = await getT()
  const today = kstDate()
  const list = [...REVISIONS].sort((a, b) => (a.to < b.to ? 1 : -1))
  return (
    <Page style={{ maxWidth: 640 }}>
      <Back href="/home" />
      <PageHeader title={t('약관 개정 안내')} lead={t('바뀌는 내용과 적용일을 적용일 7일 전부터, 회원에게 불리하거나 중요한 변경은 30일 전부터 서비스 안에 알려요.')} />
      <Notice style={{ marginBottom: 'var(--space-5)' }}>
        {t('바뀐 약관에 동의하지 않으면 적용일 전까지 계정을 삭제할 수 있어요. 적용일까지 거부 의사를 밝히지 않으면 바뀐 약관에 동의한 것으로 봐요(서비스 이용약관 제3조 ④).')}
      </Notice>
      {list.length === 0 && <p className="t-body" style={{ color: 'var(--color-text-secondary)' }}>{t('지금 예정된 개정은 없어요.')}</p>}
      <div className="stack" style={{ gap: 'var(--space-6)' }}>
        {list.map((r) => (
          <section key={`${r.doc}-${r.to}`} className="stack" style={{ gap: 'var(--space-3)' }}>
            <h2 className="t-title-3">
              <TransitionLink href={`/terms/${r.doc}`} className="hit">{t(LEGAL_TITLES[r.doc])}</TransitionLink>
              {' '}<span className="t-caption" style={{ color: r.to > today ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)' }}>{r.to > today ? t('적용 예정') : t('시행됨')}</span>
            </h2>
            <dl className="t-caption" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', color: 'var(--color-text-secondary)' }}>
              <dt>{t('공지일')}</dt><dd style={{ margin: 0 }}>{r.announcedAt}</dd>
              <dt>{t('적용일')}</dt><dd style={{ margin: 0 }}>{r.to} ({t('버전 {version}', { version: r.from })} → {t('버전 {version}', { version: r.to })})</dd>
              <dt>{t('고지 기간')}</dt><dd style={{ margin: 0 }}>{r.kind === 'major' ? t('{n}일 전 — 회원에게 불리하거나 중요한 변경', { n: NOTICE_DAYS.major }) : t('{n}일 전 — 회원에게 불리하지 않은 변경', { n: NOTICE_DAYS.minor })}</dd>
            </dl>
            <div lang="ko" style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <table className="t-caption" style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', color: 'var(--color-text-secondary)' }}>
                <thead><tr>{[t('조항'), t('바뀌기 전'), t('바뀐 뒤')].map((h) => <th key={h} scope="col" style={{ textAlign: 'left', padding: '10px 12px', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {r.changes.map((c) => (
                    <tr key={c.clause} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{c.clause}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', lineHeight: 1.55 }}>{c.before}</td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top', lineHeight: 1.55, color: 'var(--color-text-primary)' }}>{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
      <SiteFooter />
    </Page>
  )
}
