import { TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { LEGAL_TITLES } from '@/lib/legal'
import { kstDate, noticedRevisions } from '@/lib/legal/revisions'

/**
 * 약관·처리방침 개정 안내 띠(2026-10-05) — 약관 제3조 ③·처리방침 16항의 '서비스 안에 알린다'. 홈(초기화면)과 '나' 화면에 둔다.
 * 공지 시작부터 시행 뒤 30일까지 보인다(revisions.ts). 닫기는 없다 — 고지 기간 내내 보여야 하는 안내라서.
 */
export async function LegalRevisionNotice({ style }: { style?: React.CSSProperties } = {}) {
  const now = new Date()
  const list = noticedRevisions(now)
  if (!list.length) return null
  const t = await getT()
  const today = kstDate(now)
  return (
    <aside role="status" className="t-caption" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 10px', padding: '10px var(--gutter)', background: 'var(--color-surface-1)', color: 'var(--color-text-secondary)', ...style }}>
      {list.map((r) => (
        <span key={`${r.doc}-${r.to}`}>
          {r.to > today
            ? t('{doc}이(가) {date}부터 일부 바뀌어요.', { doc: t(LEGAL_TITLES[r.doc]), date: r.to })
            : t('{doc}이(가) {date}에 바뀌었어요.', { doc: t(LEGAL_TITLES[r.doc]), date: r.to })}
        </span>
      ))}
      <TransitionLink href="/terms/revisions" className="hit" style={{ color: 'var(--color-accent-text)', fontWeight: 'var(--weight-semibold)' }}>{t('바뀌는 내용 보기')}</TransitionLink>
    </aside>
  )
}
