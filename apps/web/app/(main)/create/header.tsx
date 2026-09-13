'use client'
import { motion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'

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
 * 진행 막대는 남은 일을 감추지 않는다.
 */
export function CreateHeader({ index, onBack }: {
  index: number
  onBack: () => void
}) {
  const progress = (index + 1) / STEPS.length
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

      {/*
        진행 막대 — 브랜드 색이 차오르는 유일한 자리.
        '1 / 3' 글자는 지웠다 (막대가 이미 같은 말을 한다). 대신 막대가 progressbar 로
        그 값을 들고 있어야 한다 — aria-hidden 으로 두면 화면을 못 보는 사람에게는
        몇 단계 중 어디인지가 통째로 사라진다.
      */}
      <div role="progressbar" aria-label="만들기 단계"
        aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index + 1}
        aria-valuetext={`${STEPS.length}단계 중 ${index + 1}단계: ${STEPS[index]?.label ?? ''}`}
        style={{ height: 3, borderRadius: 2, background: 'var(--color-surface-2)', overflow: 'hidden' }}>
        <motion.div animate={{ scaleX: progress }} initial={{ scaleX: 0 }} transition={tween.enter}
          style={{ height: '100%', background: 'var(--color-accent)', transformOrigin: 'left center' }} />
      </div>
    </header>
  )
}
