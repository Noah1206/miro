'use client'
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

/** 두세 칸 나눔 버튼 — 11/21 사용자: 알약 모양 회색 바탕 안에서 고른 칸만 흰 알약·굵은 글자(그 전엔 칸마다 테두리·고른 칸 라벤더). */
export function Segmented<V extends string>({ name, value, onChange, options }: {
  name?: string; value: V; onChange: (v: V) => void; options: Array<{ value: V; label: string; hint?: string; unveil?: boolean }>
}) {
  // 언베일 칸(11/3): 고르면 홈 언베일 토글과 같은 빨강·자홍·보라 그라데이션.
  const unveilOn = { background: 'linear-gradient(115deg, #ff1f5a 0%, #e0119d 55%, #9b1cff 100%)', boxShadow: '0 0 16px rgb(255 31 90 / .35)' }
  const n = options.length
  const index = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div role="radiogroup" style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 4, padding: 4, borderRadius: 999, background: 'var(--color-surface-3)' }}>
      {name && <input type="hidden" name={name} value={value} />}
      {/* 11/21 사용자: 고른 칸의 흰 알약이 옆으로 미끄러진다 — 칸 하나 너비 + 간격(4px)만큼씩 옮긴다. */}
      <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: `calc((100% - ${8 + 4 * (n - 1)}px) / ${n})`, borderRadius: 999,
        background: '#fff', transform: `translateX(calc(${index} * (100% + 4px)))`, transition: 'transform 260ms cubic-bezier(.3,.7,.2,1), background 260ms',
        ...(options[index]?.unveil ? unveilOn : {}) }} />
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            style={{ position: 'relative', minHeight: 48, padding: '8px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', textAlign: 'center',
              background: 'transparent', color: on ? (o.unveil ? '#fff' : '#16161a') : 'var(--color-text-secondary)',
              fontSize: fieldFont, fontWeight: on ? 'var(--weight-bold)' : 400, transition: 'color 200ms' }}>
            {o.label}
            {o.hint && <span className="t-caption" style={{ display: 'block', marginTop: 2, color: on ? (o.unveil ? '#ffe0ec' : '#5c5c66') : 'var(--color-text-tertiary)' }}>{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** 단계 슬라이더(10/28 생각·출력량, 11/3 채팅 답변 길이도) — 막대 위 점 n개, 고른 데까지 라벤더. name 이 없으면 폼 값은 남기지 않는다. */
export function StepSlider({ name, label, steps, value, onChange }: {
  name?: string; label: string; steps: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (v: string) => void
}) {
  const last = steps.length - 1
  const index = Math.max(0, steps.findIndex(s => s.value === value))
  const at = (k: number) => `calc(8px + (100% - 16px) * ${k / last})`
  return (
    <div>
      {name && <input type="hidden" name={name} value={steps[index]!.value} />}
      <div style={{ position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, height: 16, borderRadius: 8, background: 'var(--color-surface-3)' }} />
        {/* 11/3: 오른쪽(더 긴·더 많은) 단계일수록 짙게 — 그라데이션은 막대 전체에 깔고 고른 데까지만 보이게 자른다. */}
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, height: 16, borderRadius: 8, background: 'linear-gradient(90deg, var(--color-lavender-300), var(--color-lavender-600))',
          clipPath: `inset(0 calc(100% - ${at(index)} - 9px) 0 0 round 8px)`, transition: 'clip-path 200ms' }} />
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
