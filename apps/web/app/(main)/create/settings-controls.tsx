'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n/client'
import { box, fieldFont } from './form-parts'

/** 분류·설정 탭(10/28) 전용 입력 — 칩 대신 드롭다운·나눔 버튼·단계 슬라이더. 고른 쪽은 라벤더. */
const chevron = (open = false) => (
  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ flex: 'none', transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : undefined }}><path d="m6 9 6 6 6-6" /></svg>
)

export function SelectField({ name, value, onChange, placeholder, options }: {
  name: string; value: string; onChange: (v: string) => void; placeholder?: string; options: Array<{ value: string; label: string }>
}) {
  return (
    <div style={{ position: 'relative', color: 'var(--color-text-secondary)' }}>
      <select name={name} value={value} onChange={e => onChange(e.target.value)}
        style={{ ...box(false), appearance: 'none', width: '100%', minHeight: 52, padding: '0 44px 0 16px', borderRadius: 12, cursor: 'pointer', outline: 'none',
          fontSize: fieldFont, color: value || !placeholder ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>{chevron()}</span>
    </div>
  )
}

/** 두세 칸 나눔 버튼 — 고른 칸만 라벤더 테두리·옅은 라벤더 면. */
export function Segmented<V extends string>({ name, value, onChange, options }: {
  name?: string; value: V; onChange: (v: V) => void; options: Array<{ value: V; label: string; hint?: string }>
}) {
  return (
    <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 8 }}>
      {name && <input type="hidden" name={name} value={value} />}
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            style={{ minHeight: 56, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
              border: `1.5px solid ${on ? 'var(--color-lavender-300)' : 'var(--color-border)'}`,
              background: on ? 'color-mix(in srgb, var(--color-lavender-300) 14%, var(--color-surface-2))' : 'var(--color-surface-2)',
              color: on ? 'var(--color-lavender-200)' : 'var(--color-text-secondary)', fontSize: fieldFont, fontWeight: on ? 'var(--weight-semibold)' : 400 }}>
            {o.label}
            {o.hint && <span className="t-caption" style={{ display: 'block', marginTop: 2, color: on ? 'var(--color-lavender-300)' : 'var(--color-text-tertiary)' }}>{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** 단계 슬라이더(10/28 생각·출력량) — 막대 위 점 n개, 고른 데까지 라벤더. */
export function StepSlider({ name, label, steps, value, onChange }: {
  name: string; label: string; steps: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (v: string) => void
}) {
  const last = steps.length - 1
  const index = Math.max(0, steps.findIndex(s => s.value === value))
  const at = (k: number) => `calc(8px + (100% - 16px) * ${k / last})`
  return (
    <div>
      <input type="hidden" name={name} value={steps[index]!.value} />
      <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, height: 16, borderRadius: 8, background: 'var(--color-surface-3)' }} />
        <div aria-hidden style={{ position: 'absolute', left: 0, width: at(index), height: 16, borderRadius: 8, background: 'linear-gradient(90deg, var(--color-lavender-500), var(--color-lavender-300))', transition: 'width 200ms' }} />
        {steps.map((_, k) => <span key={k} aria-hidden style={{ position: 'absolute', left: `calc(${at(k)} - 3px)`, width: 6, height: 6, borderRadius: 3, background: k <= index ? '#fff8' : 'var(--color-text-disabled)' }} />)}
        <span aria-hidden style={{ position: 'absolute', left: `calc(${at(index)} - 9px)`, width: 18, height: 18, borderRadius: 9, background: 'var(--color-white)', transition: 'left 200ms' }} />
        <input type="range" min={0} max={last} step={1} value={index} onChange={e => onChange(steps[Number(e.target.value)]!.value)} aria-label={label} aria-valuetext={steps[index]!.label}
          style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', margin: 0 }} />
      </div>
      <div style={{ position: 'relative', height: 20, marginTop: 6 }}>
        {steps.map((s, k) => <button key={s.value} type="button" onClick={() => onChange(s.value)} className="t-caption"
          style={{ position: 'absolute', left: at(k), transform: k === 0 ? 'translateX(-8px)' : k === last ? 'translateX(calc(-100% + 8px))' : 'translateX(-50%)', whiteSpace: 'nowrap',
            background: 'none', border: 0, padding: 0, cursor: 'pointer', color: k === index ? 'var(--color-lavender-200)' : 'var(--color-text-tertiary)', fontWeight: k === index ? 'var(--weight-semibold)' : 400 }}>{s.label}</button>)}
      </div>
    </div>
  )
}

/** 접었다 펴는 칸 — 닫혀 있을 땐 고른 값 요약, 펴면 아래에 고르는 칸. 안의 입력은 닫혀도 남아 제출된다. */
export function Disclosure({ summary, placeholder, children }: { summary: string[]; placeholder: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}
        style={{ ...box(open), display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 52, padding: '10px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 8px', fontSize: fieldFont }}>
          {summary.length ? summary.map(s => <span key={s} style={{ color: 'var(--color-lavender-200)' }}>#{s}</span>)
            : <span style={{ color: 'var(--color-text-tertiary)' }}>{placeholder}</span>}
        </span>
        {chevron(open)}
      </button>
      <div hidden={!open} style={{ marginTop: 12 }}>{children}</div>
    </div>
  )
}
