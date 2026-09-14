import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, userSettings } from '@miro/db'
import { currentUser } from '@/lib/auth'
import { Page, PageHeader, Stagger, StaggerItem, TransitionLink } from '@/components/ui'
import { SettingsForm } from './form'

/**
 * 설정. 위는 연락(받기 · 야간 연락 차단), 아래는 나머지 항목으로 가는 행.
 * 마이페이지에는 톱니 하나만 두고 전부 여기로 모았다.
 */
export default async function SettingsPage() {
  const user = await currentUser()
  if (!user) redirect('/login')
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1)
  return (
    <Page style={{ maxWidth: 520 }}>
      <PageHeader back="/my" title="설정" lead="캐릭터가 언제, 어떻게 먼저 다가올 수 있는지." />
      <SettingsForm initial={{ pushEnabled: s?.pushEnabled ?? true, voiceCallEnabled: s?.voiceCallEnabled ?? true, videoCallEnabled: s?.videoCallEnabled ?? true, quietHoursEnabled: s?.quietHoursEnabled ?? true, quietHoursStart: s?.quietHoursStart ?? '23:00', quietHoursEnd: s?.quietHoursEnd ?? '08:00', timeZone: s?.timeZone ?? 'Asia/Seoul' }} />

      <h2 className="t-title-3" style={{ margin: 'var(--space-7) 0 12px' }}>계정</h2>
      <Stagger as="div" className="stack" style={{ gap: 8 }}>
        {[['/my/subscription', '구독 관리'], ['/my/verify', '성인 인증'], ['/my/permissions', '권한 안내']].map(([h, l]) => (
          <StaggerItem key={h}><Row href={h!} label={l!} /></StaggerItem>
        ))}
        <StaggerItem><Row href="/my/delete" label="계정 삭제" danger /></StaggerItem>
      </Stagger>
    </Page>
  )
}

function Row({ href, label, danger }: { href: string; label: string; danger?: boolean }) {
  return (
    <TransitionLink href={href} className="hoverable" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)', color: danger ? 'var(--color-danger)' : 'inherit' }}>
      <span className="t-body">{label}</span>
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><path d="M9 5l7 7-7 7" /></svg>
    </TransitionLink>
  )
}
