import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Notice, TransitionLink } from '@/components/ui'
import { LegalShell } from '../legal-shell'
import styles from '../legal.module.css'
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
  const toc = d.sections.map((s, i) => ({ id: `s${i + 1}`, title: s.title }))
  return (
    <LegalShell current={doc} title={t(d.title)} back="/onboarding" toc={toc}>
      {language !== 'ko' && <Notice className={styles.notice}>{t('이 문서는 한국어 원문이 기준이에요.')}</Notice>}
      {pending.map((r) => (
        <Notice key={r.to} tone="relationship" className={styles.notice}>
          {t('이 문서는 {date}부터 일부 바뀌어요.', { date: r.to })}{' '}
          <TransitionLink href="/terms/revisions" className="hit" style={{ fontWeight: 'var(--weight-semibold)' }}>{t('바뀌는 내용 보기')}</TransitionLink>
        </Notice>
      ))}
      <article lang="ko">
        <p className={styles.meta}>{t('버전 {version}', { version: d.version })}</p>
        {d.intro && <p className={styles.lead}>{d.intro}</p>}
        {d.sections.map((s, i) => (
          <section key={s.title}>
            <h2 id={toc[i]!.id}>{s.title}</h2>
            {s.blocks.map((b, j) => <Block key={j} block={b} />)}
          </section>
        ))}
        <p className={styles.closing}>{`부칙 — 이 문서는 ${d.version}부터 시행합니다.`}</p>
      </article>
    </LegalShell>
  )
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p>{block}</p>
  // 중요한 조항은 굵게, 바탕을 한 단 밝혀 — 약관규제법 제3조(중요 내용 명확 표시).
  if ('important' in block) return <p className={styles.important}>{block.important}</p>
  if ('list' in block) {
    const Tag = block.ordered ? 'ol' : 'ul'
    return <Tag>{block.list.map((item) => <li key={item}>{item}</li>)}</Tag>
  }
  // 표는 휴대폰에서 옆으로 넘겨 본다 — 칸을 억지로 좁히면 글자가 한 글자씩 줄바꿈된다.
  return (
    <div className={styles.tableWrap}>
      <table>
        <thead><tr>{block.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{block.table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
