import { TransitionLink } from '@/components/ui'

/**
 * 프로필 카드: 아바타 · 이름 · @핸들 · 숫자. 오른쪽 위에 설정 톱니 하나.
 * 팔로우는 없으니 숫자는 실제 있는 것 — 만든 캐릭터 · 공개 · 진행 중 대화.
 * 버튼 줄은 두지 않는다 — 여기서 바꿀 것이 없고, 설정은 아이콘 하나면 찾는다.
 */
export function ProfileCard({ name, handle, stats }: {
  name: string; handle: string; stats: Array<{ label: string; value: number }>
}) {
  return (
    <section style={{ position: 'relative', padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
      <TransitionLink href="/my/settings" aria-label="설정"
        style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 18, display: 'grid', placeItems: 'center', color: 'var(--color-text-secondary)' }}>
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </TransitionLink>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingRight: 44 }}>
        <span aria-hidden style={{
          width: 64, height: 64, borderRadius: 32, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: 'var(--color-surface-3)', color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 700,
        }}>{name.slice(0, 1).toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <p className="t-title-3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>@{handle}</p>
        </div>
      </div>

      <dl style={{ display: 'flex', gap: 18, margin: '18px 0 0', padding: 0 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
            <dd className="t-body" style={{ margin: 0, color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>{s.value}</dd>
            <dt className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}
