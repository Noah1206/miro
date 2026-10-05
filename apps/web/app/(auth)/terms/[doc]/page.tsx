import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Back, Notice, Page, PageHeader, TransitionLink } from '@/components/ui'
import { SiteFooter } from '@/components/site-footer'
import { legalDocs, isLegalKey, type LegalBlock } from '@/lib/legal'
import { pendingRevisions } from '@/lib/legal/revisions'
import { msg } from '@/lib/i18n'
import { getLanguage, getT } from '@/lib/i18n/server'

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params
  const t = await getT()
  return { title: t(isLegalKey(doc) ? legalDocs()[doc].title : msg('약관')) }
}

/**
 * 약관·처리방침·안내 전문(lib/legal). 본문은 한국어 원문이 기준이라 번역하지 않고, 다른 언어 화면에서는 그 사실만 알린다.
 * 문서는 코드가 실제로 하는 일(수집 항목·외부 서비스·보관 기간)과 법이 요구하는 항목으로 썼다(2026-09-30) — 법무 검토 전 초안이다.
 * 본문은 요청 시점의 시행 버전이고, 시행 전 개정이 공지돼 있으면 위에 알린다(revisions.ts).
 */
export default async function TermsDoc({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params
  if (!isLegalKey(doc)) notFound()
  const now = new Date()
  const d = legalDocs(now)[doc]
  const pending = doc === 'service' || doc === 'privacy' ? pendingRevisions(now, doc) : []
  const [t, language] = await Promise.all([getT(), getLanguage()])
  return (
    <Page style={{ maxWidth: 640 }}>
      <Back href="/onboarding" label={t('동의 화면으로')} />
      <PageHeader title={t(d.title)} lead={t('버전 {version}', { version: d.version })} />
      {language !== 'ko' && <Notice style={{ marginBottom: 'var(--space-5)' }}>{t('이 문서는 한국어 원문이 기준이에요.')}</Notice>}
      {pending.map((r) => (
        <Notice key={r.to} tone="relationship" style={{ marginBottom: 'var(--space-5)' }}>
          {t('이 문서는 {date}부터 일부 바뀌어요.', { date: r.to })}{' '}
          <TransitionLink href="/terms/revisions" className="hit" style={{ fontWeight: 'var(--weight-semibold)' }}>{t('바뀌는 내용 보기')}</TransitionLink>
        </Notice>
      ))}
      <article lang="ko" className="stack" style={{ gap: 'var(--space-6)', paddingBottom: 'var(--space-7)' }}>
        {d.intro && <p className="t-body" style={{ color: 'var(--color-text-secondary)' }}>{d.intro}</p>}
        {d.sections.map((s) => (
          <section key={s.title} className="stack" style={{ gap: 'var(--space-3)' }}>
            <h2 className="t-title-3">{s.title}</h2>
            {s.blocks.map((b, i) => <Block key={i} block={b} />)}
          </section>
        ))}
        <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{`부칙 — 이 문서는 ${d.version}부터 시행합니다.`}</p>
      </article>
      <SiteFooter />
    </Page>
  )
}

const text: React.CSSProperties = { color: 'var(--color-text-secondary)', lineHeight: 1.7 }

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p className="t-body" style={text}>{block}</p>
  // 중요한 조항은 굵게, 바탕을 한 단 밝혀 — 약관규제법 제3조(중요 내용 명확 표시).
  if ('important' in block) return (
    <p className="t-body" style={{ ...text, color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)' }}>{block.important}</p>
  )
  if ('list' in block) {
    const Tag = block.ordered ? 'ol' : 'ul'
    return (
      <Tag className="t-body" style={{ ...text, margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
        {block.list.map((item) => <li key={item}>{item}</li>)}
      </Tag>
    )
  }
  // 표는 휴대폰에서 옆으로 넘겨 본다 — 칸을 억지로 좁히면 글자가 한 글자씩 줄바꿈된다.
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <table className="t-caption" style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', color: 'var(--color-text-secondary)' }}>
        <thead>
          <tr>{block.table.head.map((h) => <th key={h} scope="col" style={{ textAlign: 'left', padding: '10px 12px', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, r) => (
            <tr key={r} style={{ borderTop: '1px solid var(--color-border)' }}>
              {row.map((cell, c) => <td key={c} style={{ padding: '10px 12px', verticalAlign: 'top', lineHeight: 1.55 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
