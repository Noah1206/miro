'use client'
import { motion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { spring } from '@/lib/motion/tokens'

export type CreateTab = 'profile' | 'personality' | 'appearance' | 'world' | 'relationship' | 'contact' | 'intro' | 'settings'

export const TABS: Array<{ key: CreateTab; label: string; required?: boolean }> = [
  { key: 'profile', label: '프로필', required: true },
  { key: 'personality', label: '성격', required: true },
  { key: 'appearance', label: '외형' },
  { key: 'world', label: '세계' },
  { key: 'relationship', label: '관계' },
  { key: 'contact', label: '연락' },
  { key: 'intro', label: '인트로', required: true },
  { key: 'settings', label: '설정' },
]

/**
 * 만들기 머리 (레퍼런스 구조): 닫기 · 제목 · 임시저장 · 등록, 그 아래 가로 스크롤 탭.
 * 필수 탭은 * 를 달고, 아직 비었으면 ! 배지가 붙는다 — 어디를 더 채워야 하는지 탭만 보고 안다.
 * 등록은 필수가 다 찰 때까지 눌리지 않는다. 임시저장은 이름만 있으면 된다.
 */
export function CreateHeader({ tab, onTab, missing, canSubmit, canDraft, pending }: {
  tab: CreateTab
  onTab: (t: CreateTab) => void
  /** 필수가 비어 있는 탭. */
  missing: Set<CreateTab>
  canSubmit: boolean
  canDraft: boolean
  pending: boolean
}) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, margin: '0 calc(-1 * var(--space-5))',
      background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 var(--space-5)' }}>
        <TransitionLink href="/home" direction="back" aria-label="닫기"
          style={{ display: 'inline-flex', color: 'var(--color-text-primary)', padding: 4 }}>
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </TransitionLink>
        <h1 className="t-title-3" style={{ flex: 1 }}>캐릭터</h1>
        <button type="submit" name="intent" value="draft" disabled={!canDraft || pending} style={chip(false, canDraft && !pending)}>임시저장</button>
        <button type="submit" name="intent" value="publish" disabled={!canSubmit || pending} style={chip(true, canSubmit && !pending)}>
          {pending ? '만드는 중' : '등록'}
        </button>
      </div>

      <div role="tablist" aria-label="만들기 항목" style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 var(--space-4)' }}>
        {TABS.map((t) => {
          const active = t.key === tab
          const warn = t.required && missing.has(t.key)
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active} aria-controls={`panel-${t.key}`} onClick={() => onTab(t.key)}
              style={{
                position: 'relative', flexShrink: 0, padding: '12px 10px', background: 'transparent', border: 0, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--font-body-size)', fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}>
              {t.required && <span aria-hidden style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8em', verticalAlign: 'super' }}>*</span>}
              {t.label}
              {warn && (
                <span aria-label="필수 항목이 비어 있음" style={{
                  display: 'grid', placeItems: 'center', width: 16, height: 16, borderRadius: 8,
                  background: 'var(--color-danger)', color: 'var(--color-white)', fontSize: 11, fontWeight: 700,
                }}>!</span>
              )}
              {active && <motion.span layoutId="create-tab-underline" transition={spring.default}
                style={{ position: 'absolute', left: 8, right: 8, bottom: 0, height: 2, background: 'var(--color-accent)' }} />}
            </button>
          )
        })}
      </div>
    </header>
  )
}

function chip(primary: boolean, on: boolean): React.CSSProperties {
  return {
    minHeight: 34, padding: '6px 14px', borderRadius: 'var(--radius-button)', border: 0, cursor: on ? 'pointer' : 'default',
    fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)',
    background: primary && on ? 'var(--color-accent)' : 'var(--color-surface-2)',
    color: primary && on ? 'var(--color-accent-on)' : on ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
  }
}
