'use client'
import { TransitionLink } from '@/components/ui'

export type CreateStep = 'who' | 'world' | 'scene'

export const STEPS: Array<{ key: CreateStep; label: string }> = [
  { key: 'who', label: '누구인가' },
  { key: 'world', label: '어디에 사는가' },
  { key: 'scene', label: '어떻게 만나는가' },
]

/**
 * 만들기 화면의 머리.
 *
 * 레퍼런스는 탭 위에 긴 폼을 올려 두지만, 여기서는 한 번에 하나씩 묻는 단계형으로 간다 —
 * 캐릭터를 만드는 일은 서류를 채우는 일이 아니라 한 사람을 떠올리는 일이고,
 * 그 순서(누구인가 → 어디에 사는가 → 어떻게 만나는가)가 화면에 그대로 보여야 한다.
 *
 * 머리에는 닫기/뒤로 하나만 둔다. 진행 막대도 단계 숫자도 없다 — 질문이 곧 어디쯤인지
 * 말해 주고, 남은 단계를 세는 일은 사용자가 할 일이 아니다.
 * 단계 위치는 질문 제목이 화면에 보이지 않는 말로 함께 읽어 준다 (page.tsx 의 sr-only).
 */
export function CreateHeader({ index, onBack }: {
  index: number
  onBack: () => void
}) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, margin: '0 calc(-1 * var(--space-5))',
      padding: '0 var(--space-5) var(--space-3)', background: 'var(--color-bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56 }}>
        {index === 0 ? (
          <TransitionLink href="/home" direction="back" aria-label="닫기"
            style={{ display: 'inline-flex', color: 'var(--color-text-primary)', padding: 4 }}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </TransitionLink>
        ) : (
          <button type="button" onClick={onBack} aria-label="이전 단계"
            style={{ display: 'inline-flex', background: 'none', border: 0, color: 'var(--color-text-primary)', padding: 4, cursor: 'pointer' }}>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
      </div>
    </header>
  )
}
