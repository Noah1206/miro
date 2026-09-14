'use client'
import { useState } from 'react'
import { Button, ButtonLink, Sheet } from '@/components/ui'
import { updateDisplayName } from './actions'

/**
 * 프로필 카드 (레퍼런스 구조): 아바타 · 이름 · @핸들 · 숫자 · 버튼 두 개.
 * 팔로우는 없으니 숫자는 실제 있는 것 — 만든 캐릭터 · 공개 · 진행 중 대화.
 * '프로필 편집' 은 이름만 바꾼다. 그 이상은 아직 바꿀 것이 없다.
 */
export function ProfileCard({ name, handle, stats }: {
  name: string; handle: string; stats: Array<{ label: string; value: number }>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
        <Button type="button" variant="secondary" onClick={() => { setDraft(name); setEditing(true) }}>프로필 편집</Button>
        <ButtonLink href="/my/settings" variant="secondary">설정</ButtonLink>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="프로필 편집">
        <form action={async (f) => { await updateDisplayName(f); setEditing(false) }} className="stack" style={{ gap: 14 }}>
          <label className="stack" style={{ gap: 6 }}>
            <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>표시 이름</span>
            <input name="displayName" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20} autoComplete="off"
              style={{ width: '100%', padding: '10px 0', background: 'none', border: 0, outline: 'none', borderBottom: '1.5px solid var(--color-border-strong)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-lg)' }} />
            <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>비우면 계정 이름으로 돌아갑니다.</span>
          </label>
          <Button type="submit" variant="primary" size="lg" full>저장</Button>
        </form>
      </Sheet>
    </section>
  )
}
