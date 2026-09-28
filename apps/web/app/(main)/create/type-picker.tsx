'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, TransitionLink } from '@/components/ui'
import { activeDraftKey, CREATE_CHARACTER_OPTIONS, type CreateCharacterType } from '@/lib/create-character-types'

export function CreateTypePicker({ userId, saved: savedCharacters }: { userId: string; saved: Array<{ id: string; type: CreateCharacterType; isDraft: boolean }> }) {
  const router = useRouter()
  const [selected, setSelected] = useState<CreateCharacterType | null>(null)
  const continueToEditor = () => {
    if (!selected) return
    const activeKey = activeDraftKey(userId, selected)
    let draftId: string | null = null
    try {
      const saved = localStorage.getItem(activeKey)
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) draftId = saved
      const existing = savedCharacters.find(row => row.id === draftId && row.type === selected)
      if (existing?.isDraft) { router.push(`/my/characters/${existing.id}/edit`); return }
      if (existing) draftId = null
      if (!draftId) {
        draftId = crypto.randomUUID()
        localStorage.setItem(activeKey, draftId)
      }
    } catch { draftId = crypto.randomUUID() }
    router.push(`/create?type=${selected}&draft=${draftId}`)
  }

  return <main id="main" className="page" style={{ maxWidth: 560, paddingTop: 'var(--space-4)' }}>
    <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-7)' }}>
      <TransitionLink href="/home" direction="back" aria-label="홈으로 돌아가기" className="hit"
        style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginLeft: -10 }}>
        <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
      </TransitionLink>
      <h1 className="t-title-2">어떤 캐릭터를 만들까요?</h1>
    </header>
    <div role="radiogroup" aria-label="캐릭터 유형" className="stack" style={{ gap: 12 }}>
      {CREATE_CHARACTER_OPTIONS.map((option, index) => <button key={option.type} type="button" role="radio" aria-checked={selected === option.type}
        tabIndex={selected === null ? (index === 0 ? 0 : -1) : (selected === option.type ? 0 : -1)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          const nextIndex = (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + CREATE_CHARACTER_OPTIONS.length) % CREATE_CHARACTER_OPTIONS.length
          setSelected(CREATE_CHARACTER_OPTIONS[nextIndex]!.type)
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus()
        }}
        onClick={() => setSelected(option.type)} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 88,
          padding: '16px', textAlign: 'left', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          border: `1px solid ${selected === option.type ? 'var(--color-border-hover)' : 'var(--color-border)'}`,
          background: selected === option.type ? 'var(--color-surface-2)' : 'var(--color-surface-1)', color: 'var(--color-text-primary)' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong className="t-body-lg" style={{ display: 'block', marginBottom: 5 }}>{option.title}</strong>
          <span className="t-caption" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{option.description}</span>
        </span>
        <span aria-hidden style={{ width: 18, height: 18, flexShrink: 0, marginLeft: 12, borderRadius: '50%',
          border: `2px solid ${selected === option.type ? 'var(--color-accent-text)' : 'var(--color-text-tertiary)'}`,
          background: selected === option.type ? 'var(--color-accent-text)' : 'transparent', boxShadow: selected === option.type ? 'inset 0 0 0 3px var(--color-surface-2)' : 'none' }} />
      </button>)}
    </div>
    <Button type="button" variant="primary" full disabled={!selected} onClick={continueToEditor}
      style={{ marginTop: 'var(--space-7)' }}>계속</Button>
  </main>
}
