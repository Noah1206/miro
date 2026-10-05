import { TransitionLink } from '@/components/ui'
import { getT } from '@/lib/i18n/server'
import { LEGAL_TITLES, type LegalKey } from '@/lib/legal'
import { OPERATOR, hostingLine } from '@/lib/legal/operator'
import { noticedRevisions } from '@/lib/legal/revisions'

const LINKS: LegalKey[] = ['service', 'privacy', 'refund', 'ai', 'adult']

/**
 * 사이트 바닥글(2026-10-05) — 전자상거래법 제10조·시행령 제10조가 초기화면에 요구하는 신원 정보(상호·대표자·주소·전화·이메일·사업자등록번호·
 * 통신판매업 신고번호·호스팅 제공자)와 약관·처리방침 링크, 고객문의. 홈(초기화면)·약관 화면·'나'·Miro Pay 에 둔다.
 * 「개인정보 처리방침」 링크는 다른 링크와 구분되게 굵고 밝게(개인정보 보호법 시행령 제31조 ②). 값은 lib/legal/operator.ts 에서 오고, 빈 값은 싣지 않는다.
 */
export async function SiteFooter({ style }: { style?: React.CSSProperties } = {}) {
  const t = await getT()
  const o = OPERATOR
  const rows: Array<[string, string]> = [
    [t('상호'), o.brand], [t('대표자'), o.representative], [t('사업자등록번호'), o.registrationNumber],
    [t('주소'), o.address], ...(o.phone ? [[t('전화'), o.phone] as [string, string]] : []), [t('이메일'), o.email],
    ...(o.mailOrder ? [[t('통신판매업'), o.mailOrder] as [string, string]] : []),
    [t('호스팅 서비스 제공'), hostingLine()],
  ]
  const revising = noticedRevisions().length > 0
  return (
    <footer lang="ko" className="t-caption" style={{ marginTop: 'var(--space-8)', padding: 'var(--space-5) var(--gutter) var(--space-6)', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', ...style }}>
      <nav aria-label={t('약관과 정책')} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', marginBottom: 'var(--space-4)' }}>
        {LINKS.map((key) => (
          <TransitionLink key={key} href={`/terms/${key}`} className="hit"
            style={key === 'privacy' ? { color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--font-body-size)' } : undefined}>
            {t(LEGAL_TITLES[key])}
          </TransitionLink>
        ))}
        <TransitionLink href="/terms/revisions" className="hit" style={revising ? { color: 'var(--color-accent-text)' } : undefined}>{t('약관 개정 안내')}</TransitionLink>
      </nav>
      <dl style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: '2px 12px', lineHeight: 1.6 }}>
        {rows.map(([k, v]) => <div key={k} style={{ display: 'flex', gap: 4 }}><dt style={{ margin: 0 }}>{k}</dt><dd style={{ margin: 0, color: 'var(--color-text-secondary)' }}>{v}</dd></div>)}
      </dl>
      <p style={{ margin: 'var(--space-3) 0 0', lineHeight: 1.6 }}>
        {t('고객문의')}: <a href={`mailto:${o.email}`} className="hit" style={{ color: 'var(--color-text-secondary)' }}>{o.email}</a> · {t('문의·환불·개인정보 요청은 이메일로 받아요. 10일 안에 답해 드려요.')}
      </p>
      <p style={{ margin: 'var(--space-2) 0 0' }}>© {o.brand} · MIRO</p>
    </footer>
  )
}
