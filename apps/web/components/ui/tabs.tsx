'use client'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { spring } from '@/lib/motion/tokens'

type Tab = { key: string; label: string; href?: string }

/**
 * 활성 표시는 dot 교체가 아니라 하나의 밑줄이 이동한다 (shared layout, layoutId).
 * Active = white, inactive = gray. Accent 금지.
 */
export function Tabs({ tabs, active, onChange, id = 'tabs' }: { tabs: Tab[]; active: string; onChange?: (k: string) => void; id?: string }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)' }}>
      {tabs.map((t) => {
        const isActive = t.key === active
        const inner = (
          <>
            <span style={{ color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', transition: 'color var(--motion-fast) var(--ease-standard)' }}>{t.label}</span>
            {isActive && <motion.span layoutId={`${id}-underline`} transition={spring.default} style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: 'var(--color-accent)' }} />}
          </>
        )
        const style: React.CSSProperties = { position: 'relative', padding: '10px 14px', minHeight: 44, background: 'transparent', border: 0, fontSize: 'var(--font-body-size)', fontWeight: 'var(--weight-medium)' }
        return t.href
          ? <Link key={t.key} href={t.href} role="tab" aria-selected={isActive} style={style}>{inner}</Link>
          : <button key={t.key} type="button" role="tab" aria-selected={isActive} onClick={() => onChange?.(t.key)} style={style}>{inner}</button>
      })}
    </div>
  )
}

/** 세그먼트 컨트롤 (출력 스타일 등). 눌린 항목은 흰 배경. */
export function Segmented({ options, value, onChange, size = 'sm', label }: { options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void; size?: 'sm' | 'md'; label?: string }) {
  /**
   * 누르는 즉시 이동한다(낙관적). 서버가 확정하면 value 가 따라온다.
   *
   * 사용자가 고른 값은 서버 왕복에 덮이지 않아야 한다 — `value` 가 바뀔 때마다 무조건
   * 되돌리면, 저장이 끝나기 전에 도착한 이전 값이 선택을 취소해 버린다(간헐적으로 그랬다).
   * 그래서 아직 고르지 않았을 때만 서버 값을 따른다.
   */
  const [local, setLocal] = useState(value)
  const [picked, setPicked] = useState(false)
  useEffect(() => { if (!picked) setLocal(value) }, [value, picked])
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', padding: 3, gap: 2, background: 'var(--color-surface-1)', borderRadius: 'var(--radius-sm)' }}>
      {options.map((o) => {
        const on = o.value === local
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => { setLocal(o.value); setPicked(true); onChange(o.value) }} style={{ position: 'relative', minHeight: 44, padding: size === 'sm' ? '4px 10px' : '8px 14px', border: 0, background: 'transparent', borderRadius: 6, fontSize: size === 'sm' ? 'var(--font-micro)' : 'var(--font-caption)', letterSpacing: 0, textTransform: 'none', color: on ? 'var(--color-black)' : 'var(--color-text-secondary)', zIndex: 1 }}>
            {on && <motion.span layoutId="segmented-thumb" transition={spring.default} style={{ position: 'absolute', inset: 0, background: 'var(--color-white)', borderRadius: 6, zIndex: -1 }} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
