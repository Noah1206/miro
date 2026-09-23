'use client'

/**
 * 스위치 (제타식 토글). 켜짐은 노브만 주황 — 트랙까지 채우면 설정 화면에 주황 덩어리가 줄지어 선다.
 * 실제 요소는 checkbox 라 폼 제출에 그대로 실리고, role=switch 로 읽힌다.
 */
export function Switch({ name, label, hint, checked, onChange }: {
  name: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 0' }}>
      <span className="stack" style={{ gap: 3, flex: 1, minWidth: 0 }}>
        <span className="t-body" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
        {hint && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</span>}
      </span>
      <span style={{ position: 'relative', width: 46, height: 26, flexShrink: 0 }}>
        <input type="checkbox" role="switch" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)}
          aria-checked={checked}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, margin: 0, cursor: 'pointer' }} />
        {/* 장식은 클릭을 먹지 않는다 — input 이 위에 있는 것처럼 동작해야 마우스와 Playwright 가 누를 수 있다. */}
        <span aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: 13, pointerEvents: 'none',
          background: checked ? 'var(--color-border-strong)' : 'var(--color-surface-3)',
          transition: 'background var(--motion-fast) var(--ease-standard)',
        }} />
        <span aria-hidden style={{
          position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 10, pointerEvents: 'none',
          background: checked ? 'color-mix(in srgb, var(--color-accent-text), #ffb347 40%)' : 'var(--color-text-secondary)',
          transform: checked ? 'translateX(20px)' : 'none',
          transition: 'transform var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)',
        }} />
      </span>
    </label>
  )
}
