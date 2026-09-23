'use client'
import { motion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { spring } from '@/lib/motion/tokens'

export type CreateTab = 'profile' | 'personality' | 'appearance' | 'relationship' | 'contact' | 'intro' | 'preview'

export const TABS: Array<{ key: CreateTab; label: string }> = [
  { key: 'profile', label: '프로필' },
  { key: 'personality', label: '세계관' },
  { key: 'appearance', label: '외형' },
  { key: 'relationship', label: '관계' },
  { key: 'contact', label: '일상·연락' },
  { key: 'intro', label: '인트로' },
  { key: 'preview', label: '미리보기' },
]

/**
 * 만들기 머리 (레퍼런스 구조): 닫기 · 제목 · 등록, 그 아래 가로 스크롤 탭.
 * 탭에는 표시를 달지 않는다 — 필수는 칸의 별표가 말하고, 다 차기 전엔 등록이 잠겨 있다.
 */
export function CreateHeader({ tab, onTab, canSubmit, pending, buttons, closeHref, missingHint }: {
  tab: CreateTab
  onTab: (t: CreateTab) => void
  missingHint?: string
  canSubmit: boolean
  pending: boolean
  /** create: 등록. save: 이미 등록한 캐릭터를 고칠 때 — 저장 하나. */
  buttons: 'create' | 'save'
  closeHref: string
}) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, margin: '0 calc(-1 * var(--gutter))',
      background: 'var(--color-bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 var(--gutter)' }}>
        <TransitionLink href={closeHref} direction="back" aria-label="닫기"
          style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10, color: 'var(--color-text-primary)' }}>
          <svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </TransitionLink>
        <h1 className="sr-only">캐릭터</h1>
        <span className="t-caption" style={{ flex: 1, textAlign: 'right', fontSize: 'var(--font-micro)', transform: 'translateY(3px)', color: 'var(--color-text-secondary)' }} aria-live="polite">{missingHint}</span>
        <button type="submit" name="intent" value="publish" disabled={!canSubmit || pending} style={chip(true, canSubmit && !pending)}>
          {buttons === 'save' ? (pending ? '저장 중' : '저장') : (pending ? '게시 중' : '게시')}
        </button>
      </div>

      {/* 탭 사이 간격을 고르게 벌려 양쪽 여백이 같다. 첫·끝 탭의 글자가 페이지 여백선에 맞도록 탭 안쪽 여백(6px)만큼 뺀다. */}
      {/* 입력 탭 여섯 개는 고르게 펼치고, 미리보기는 입력이 아니라 오른쪽 끝에 아이콘 칩으로 따로 둔다. */}
      <div role="tablist" aria-label="만들기 항목" style={{ display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto', scrollbarWidth: 'none', padding: '0 var(--gutter) 0 calc(var(--gutter) - 6px)' }}>
        <div style={{ flex: '1 0 auto', display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          {TABS.filter((t) => t.key !== 'preview').map((t) => {
            const active = t.key === tab
            return (
              <button key={t.key} type="button" role="tab" aria-selected={active} aria-controls={`panel-${t.key}`} onClick={() => onTab(t.key)}
                style={{
                  position: 'relative', flexShrink: 0, padding: '12px 6px', background: 'transparent', border: 0, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--font-body-size)', fontWeight: active ? 'var(--weight-medium)' : 'var(--weight-regular)',
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                }}>
                {t.label}
                {active && <motion.span layoutId="create-tab-underline" transition={spring.default}
                  style={{ position: 'absolute', left: 4, right: 4, bottom: 0, height: 1, background: 'var(--color-accent)' }} />}
              </button>
            )
          })}
        </div>
        <button type="button" role="tab" aria-selected={tab === 'preview'} aria-controls="panel-preview" onClick={() => onTab('preview')}
          style={{
            flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '2px 10px', marginLeft: 20, borderRadius: 'var(--radius-sm)',
            border: 0, cursor: 'pointer', fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-medium)',
            background: tab === 'preview' ? 'var(--color-white)' : 'var(--color-surface-2)',
            color: tab === 'preview' ? 'var(--color-black)' : 'var(--color-text-primary)',
            transition: 'background var(--motion-fast) var(--ease-standard), color var(--motion-fast) var(--ease-standard)',
          }}>
          <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" />
          </svg>
          미리보기
        </button>
      </div>
    </header>
  )
}

function chip(primary: boolean, on: boolean): React.CSSProperties {
  return {
    minHeight: 32, padding: '4px 10px', borderRadius: 'var(--radius-button)', border: 0, cursor: on ? 'pointer' : 'default',
    fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)',
    background: primary && on ? 'var(--color-accent)' : 'var(--color-surface-2)',
    color: primary && on ? 'var(--color-accent-on)' : on ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
  }
}
