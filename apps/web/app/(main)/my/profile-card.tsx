/**
 * 프로필 카드: 아바타 · 이름 · @핸들 · 숫자. 설정 톱니는 페이지 제목 줄에 있다.
 * 팔로우는 없으니 숫자는 실제 있는 것 — 만든 캐릭터 · 공개 · 진행 중 대화.
 * 버튼 줄은 두지 않는다 — 여기서 바꿀 것이 없다.
 */
export function ProfileCard({ name, handle, stats }: {
  name: string; handle: string; stats: Array<{ label: string; value: number }>
}) {
  return (
    <section style={{ padding: 'var(--space-5)', background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
