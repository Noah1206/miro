'use client'
import { TransitionLink } from '@/components/ui'

/**
 * 만들기 화면의 머리. 닫기 하나만 둔다 —
 * 섹션 제목이 어디쯤인지 말해 주므로 단계 표시도 진행 막대도 필요하지 않다.
 */
export function CreateHeader() {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, margin: '0 calc(-1 * var(--space-5))',
      padding: '0 var(--space-5) var(--space-3)', background: 'var(--color-bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}>
        <TransitionLink href="/home" direction="back" aria-label="닫기"
          style={{ display: 'inline-flex', color: 'var(--color-text-primary)', padding: 4 }}>
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </TransitionLink>
        <h1 className="t-title-3" style={{ flex: 1 }}>캐릭터 만들기</h1>
      </div>
    </header>
  )
}
