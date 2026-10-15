'use client'
import { useState } from 'react'
import { TypedText } from '@/components/scene/typed-text'
import { useT } from '@/lib/i18n/client'

type Part = { text: string; label?: string; narration?: boolean }

/** 한 문단이 도착한 뒤 다음 문단을 연다. 과거 메시지는 즉시 표시한다. */
export function StoryPassage({ parts, animate = false, onGrow, onDone }: { parts: Part[]; animate?: boolean; onGrow?: () => void; onDone?: () => void }) {
  const t = useT()
  const [through, setThrough] = useState(animate ? 0 : parts.length)
  const [skipped, setSkipped] = useState(false)
  const typing = animate && !skipped && through < parts.length
  return <div className="stack" style={{ gap: 16 }}>
    {parts.map((part, i) => (!typing || i <= through) && <p key={i} className="t-body" style={{ lineHeight: 1.85, whiteSpace: 'pre-line', color: part.narration ? 'var(--color-text-secondary)' : undefined }}>
      {part.label && <strong>{part.label} </strong>}
      <TypedText text={part.text} animate={typing && i === through} maxParagraphMs={4500} onGrow={onGrow}
        onDone={() => { if (i !== through) return; setThrough(i + 1); if (i === parts.length - 1) onDone?.() }} />
    </p>)}
    {typing && <button type="button" className="t-caption" onClick={() => { setSkipped(true); onDone?.() }} style={{ alignSelf: 'flex-start', minHeight: 44, padding: '8px 0', background: 'none', border: 0, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>{t('한 번에 읽기')}</button>}
  </div>
}
