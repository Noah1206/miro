'use client'
import { motion } from 'motion/react'
import { fadeUp } from '@/lib/motion/tokens'

/**
 * Chat · Live Scene · Call 이 같은 문장 규칙을 쓴다 (DESIGN §11).
 * 캐릭터의 말은 버블 없이 텍스트로, 서술은 2차 톤으로, 사용자만 약한 버블.
 * "이름: 대사" 줄은 이름을 세리프로 세운다. textContent 는 "이름: 대사" 그대로 유지된다.
 */
export function CharacterText({ content, name, size = 'md' }: { content: string; name: string; size?: 'md' | 'lg' }) {
  const lines = content.split('\n').filter((l) => l.trim().length > 0)
  const fs = size === 'lg' ? 'var(--font-body-lg)' : 'var(--font-body-size)'
  return (
    <div className="stack" style={{ gap: 6, maxWidth: '88%' }}>
      {lines.map((line, i) => {
        const m = line.match(/^([^:\n]{1,24}):\s?(.*)$/)
        if (m && (m[1] === name || m[1]!.length <= 12) && m[2]) {
          return (
            <p key={i} style={{ fontSize: fs, lineHeight: 1.75 }}>
              <span className="t-name" style={{ marginRight: 2 }}>{m[1]}</span><span style={{ color: 'var(--color-text-tertiary)' }}>:</span> {m[2]}
            </p>
          )
        }
        return <p key={i} className="t-quote" style={{ fontSize: fs, lineHeight: 1.75, color: 'var(--color-text-secondary)' }}>{line}</p>
      })}
    </div>
  )
}

export function UserText({ content }: { content: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <p style={{ maxWidth: '78%', padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', fontSize: 'var(--font-body-size)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{content}</p>
    </div>
  )
}

export function SceneMeta({ children }: { children: React.ReactNode }) {
  return <p className="t-micro" style={{ textAlign: 'center', letterSpacing: '0.06em' }}>{children}</p>
}

/** 목록에 새 줄이 붙을 때. 마운트 시 fade+y, layout 으로 위쪽이 밀린다. */
export function Line({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) {
  return <motion.div layout="position" variants={fadeUp} initial="hidden" animate="show" {...rest}>{children}</motion.div>
}
