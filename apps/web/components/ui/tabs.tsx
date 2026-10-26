'use client'
import { motion } from 'motion/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { spring } from '@/lib/motion/tokens'
import section from './section-tabs.module.css'

type Tab = { key: string; label: string; href?: string }

/**
 * Full-width sections share the same underline and text states as route navigation.
 * Equal-width sections with white active text and a lavender underline.
 */
export function Tabs({ tabs, active, onChange, id = 'tabs' }: { tabs: Tab[]; active: string; onChange?: (k: string) => void; id?: string }) {
  return (
    <div id={id} role="tablist" className={section.bar}>
      {tabs.map((t) => {
        const isActive = t.key === active
        const inner = (
          <>
            <span>{t.label}</span>
          </>
        )
        return t.href
          ? <Link key={t.key} href={t.href} role="tab" aria-selected={isActive} className={section.item}>{inner}</Link>
          : <button key={t.key} type="button" role="tab" aria-selected={isActive} onClick={() => onChange?.(t.key)} className={section.item}>{inner}</button>
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
