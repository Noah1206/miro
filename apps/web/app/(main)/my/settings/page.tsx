import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth'
import { Page, PageHeader, Stagger, StaggerItem, TransitionLink } from '@/components/ui'

/**
 * 설정. 나머지 항목으로 가는 행만 둔다. 마이페이지에는 톱니 하나만 두고 전부 여기로 모았다.
 * 연락 설정(알림·통화 수신·야간 차단)은 없다 — 캐릭터의 앱 밖 연락은 항상 받는다 (2026-09-24 결정).
 * 알림 권한은 미로 캐릭터 대화방에서 묻는다.
 */
export default async function SettingsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader back="/my" title="설정" />

      <h2 className="t-title-3" style={{ margin: 'var(--space-5) 0 12px' }}>계정</h2>
      <Stagger as="div" className="stack" style={{ gap: 8 }}>
        {[['/my/subscription', '이용권 관리'], ['/my/verify', '성인 인증'], ['/my/permissions', '권한 안내']].map(([h, l]) => (
          <StaggerItem key={h}><Row href={h!} label={l!} /></StaggerItem>
        ))}
        {/* 파괴적 행동은 일반 항목과 같은 그룹에 두지 않는다 (패턴 문서 §9.6) — 선을 긋고 떨어뜨린다. */}
        <StaggerItem>
          <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
            <Row href="/my/delete" label="계정 삭제" sub="되돌릴 수 없어요" danger />
          </div>
        </StaggerItem>
      </Stagger>
    </Page>
  )
}

function Row({ href, label, sub, danger }: { href: string; label: string; sub?: string; danger?: boolean }) {
  return (
    <TransitionLink href={href} className="hoverable" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)', color: danger ? 'var(--color-danger)' : 'inherit' }}>
      <span className="stack" style={{ gap: 2 }}>
        <span className="t-body">{label}</span>
        {/* 색 하나로만 위험을 말하지 않는다 (§4.2) — 무엇이 위험한지 글로 적는다. */}
        {sub && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</span>}
      </span>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><path d="M9 5l7 7-7 7" /></svg>
    </TransitionLink>
  )
}
