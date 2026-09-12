import { forwardRef, type ReactNode } from 'react'

const base: React.CSSProperties = {
  width: '100%', padding: '13px 14px', background: 'var(--color-surface-1)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-button)',
  color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)', lineHeight: 1.5,
  transition: 'border-color var(--motion-fast) var(--ease-standard)', outline: 'none', colorScheme: 'dark',
}

/** 포커스는 흰 테두리. Accent 포커스 링 금지 (DESIGN §27). */
export const Input = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'>>(function Input(props, ref) {
  return <input ref={ref} {...props} className={`field ${props.className ?? ''}`} style={{ ...base, ...props.style }} />
})
export const TextArea = forwardRef<HTMLTextAreaElement, React.ComponentPropsWithoutRef<'textarea'>>(function TextArea(props, ref) {
  return <textarea ref={ref} {...props} className={`field ${props.className ?? ''}`} style={{ ...base, resize: 'vertical', fontFamily: 'inherit', ...props.style }} />
})

/** label 이 input 을 감싸서 getByLabel 과 탭 영역이 함께 넓어진다. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      {children}
      {hint && !error && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</span>}
      {error && <span role="alert" className="t-caption" style={{ color: 'var(--color-danger)' }}>{error}</span>}
    </label>
  )
}

/** 설정 행: 문장 + 체크박스. 색이 아니라 위치와 문장으로 상태가 읽힌다. */
export function ToggleRow({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="stack hoverable" style={{ gap: 4, padding: '14px 16px', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span className="t-body">{label}</span>
        <input name={name} type="checkbox" defaultChecked={defaultChecked} style={{ width: 20, height: 20, accentColor: 'var(--color-white)', flexShrink: 0 }} />
      </span>
      {hint && <span className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{hint}</span>}
    </label>
  )
}

export function Checkbox({ name, label, required }: { name: string; label: ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'var(--font-caption)', lineHeight: 1.55, cursor: 'pointer' }}>
      <input name={name} type="checkbox" required={required} style={{ marginTop: 2, width: 18, height: 18, accentColor: 'var(--color-white)', flexShrink: 0 }} />
      <span>{label}</span>
    </label>
  )
}

export function Radio({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <label className="hoverable" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 14px', background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-button)', cursor: 'pointer', fontSize: 'var(--font-body-size)' }}>
      <input type="radio" name={name} value={value} required style={{ accentColor: 'var(--color-white)', width: 18, height: 18 }} />
      <span>{label}</span>
    </label>
  )
}
