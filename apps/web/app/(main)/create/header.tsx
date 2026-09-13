'use client'
import { motion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { spring } from '@/lib/motion/tokens'

export type CreateTab = 'prompt' | 'profile' | 'intro'

const TABS: Array<{ key: CreateTab; label: string; required?: boolean }> = [
  { key: 'prompt', label: '프롬프트', required: true },
  { key: 'profile', label: '프로필' },
  { key: 'intro', label: '인트로', required: true },
]

/**
 * 만들기 화면의 고정 머리 (레퍼런스): 닫기 · 제목 · 임시저장 · 등록, 그 아래 탭.
 * 등록은 필수 항목이 채워질 때까지 눌리지 않는다 — 눌러 놓고 실패를 보는 것보다 낫다.
 */
export function CreateHeader({ tab, onTab, canSubmit, pending, total, max }: {
  tab: CreateTab
  onTab: (t: CreateTab) => void
  canSubmit: boolean
  pending: boolean
  total: number
  max: number
}) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, margin: '0 calc(-1 * var(--space-5))',
      padding: '0 var(--space-5)', background: 'var(--color-bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52 }}>
        <TransitionLink href="/home" direction="back" aria-label="닫기"
          style={{ display: 'inline-flex', color: 'var(--color-text-primary)', padding: 4 }}>
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </TransitionLink>
        <h1 className="t-title-3" style={{ flex: 1 }}>캐릭터</h1>
        <button type="submit" name="intent" value="draft" disabled={pending}
          style={chip(false)}>임시저장</button>
        <button type="submit" name="intent" value="publish" disabled={!canSubmit || pending}
          style={chip(canSubmit && !pending)}>{pending ? '만드는 중' : '등록'}</button>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active} onClick={() => onTab(t.key)}
              style={{
                position: 'relative', padding: '10px 12px', minHeight: 42, background: 'transparent', border: 0,
                fontSize: 'var(--font-body-size)', fontWeight: 'var(--weight-medium)', cursor: 'pointer',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}>
              {t.required && <span aria-hidden style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8em', verticalAlign: 'super' }}>*</span>}
              {t.label}
              {active && <motion.span layoutId="create-tab-underline" transition={spring.default}
                style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: 'var(--color-white)' }} />}
            </button>
          )
        })}
      </div>

      <p className="t-micro" style={{ textAlign: 'center', padding: '8px 0', textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>
        {total.toLocaleString()}/{max.toLocaleString()}자
      </p>
    </header>
  )
}

function chip(strong: boolean): React.CSSProperties {
  return {
    minHeight: 34, padding: '6px 14px', borderRadius: 'var(--radius-button)', border: 0, cursor: strong ? 'pointer' : 'default',
    fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)',
    background: strong ? 'var(--color-white)' : 'var(--color-surface-2)',
    color: strong ? 'var(--color-black)' : 'var(--color-text-disabled)',
  }
}
