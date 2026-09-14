'use client'
import { motion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { spring } from '@/lib/motion/tokens'

export type CreateTab = 'profile' | 'personality' | 'appearance' | 'relationship' | 'contact' | 'intro' | 'preview'

export const TABS: Array<{ key: CreateTab; label: string }> = [
  { key: 'profile', label: '프로필' },
  { key: 'personality', label: '성격' },
  { key: 'appearance', label: '외형' },
  { key: 'relationship', label: '관계' },
  { key: 'contact', label: '연락' },
  { key: 'intro', label: '인트로' },
  { key: 'preview', label: '소개 페이지' },
]

/**
 * 만들기 머리 (레퍼런스 구조): 닫기 · 제목 · 임시저장 · 등록, 그 아래 가로 스크롤 탭.
 * 탭에는 표시를 달지 않는다 — 필수는 칸의 별표가 말하고, 다 차기 전엔 등록이 잠겨 있다.
 * 임시저장은 이름만 있으면 된다.
 */
export function CreateHeader({ tab, onTab, canSubmit, canDraft, pending, buttons, closeHref }: {
  tab: CreateTab
  onTab: (t: CreateTab) => void
  canSubmit: boolean
  canDraft: boolean
  pending: boolean
  /** create: 임시저장·등록. save: 이미 등록한 캐릭터를 고칠 때 — 저장 하나. */
  buttons: 'create' | 'save'
  closeHref: string
}) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, margin: '0 calc(-1 * var(--gutter))',
      background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 var(--gutter)' }}>
        <TransitionLink href={closeHref} direction="back" aria-label="닫기"
          style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10, color: 'var(--color-text-primary)' }}>
          <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </TransitionLink>
        <h1 className="t-title-3" style={{ flex: 1 }}>캐릭터</h1>
        {buttons === 'create' && (
          <button type="submit" name="intent" value="draft" disabled={!canDraft || pending} style={chip(false, canDraft && !pending)}>임시저장</button>
        )}
        <button type="submit" name="intent" value="publish" disabled={!canSubmit || pending} style={chip(true, canSubmit && !pending)}>
          {buttons === 'save' ? (pending ? '저장 중' : '저장') : (pending ? '만드는 중' : '등록')}
        </button>
      </div>

      <div role="tablist" aria-label="만들기 항목" style={{ display: 'flex', gap: 2, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 var(--space-4)' }}>
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <button key={t.key} type="button" role="tab" aria-selected={active} aria-controls={`panel-${t.key}`} onClick={() => onTab(t.key)}
              style={{
                position: 'relative', flexShrink: 0, padding: '12px 10px', background: 'transparent', border: 0, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 'var(--font-body-size)', fontWeight: active ? 'var(--weight-medium)' : 'var(--weight-regular)',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              }}>
              {t.label}
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
