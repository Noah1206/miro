'use client'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ButtonLink, TransitionLink } from '@/components/ui'
import { spring, tween } from '@/lib/motion/tokens'
import type { ArchiveItem } from '@/lib/ops/archive'

/**
 * 항목이 사라지면 아래가 올라온다 (Layout Animation). 관계 수치는 어디에도 없다.
 * 보관/복원은 서버 액션. 눌린 즉시 토스트로 확인.
 */
export function ArchiveList({ items }: {
  items: ArchiveItem[]
}) {
  const [query, setQuery] = useState('')
  const [managing, setManaging] = useState(false)
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ko')
    return keyword ? items.filter((item) => item.characterName.toLocaleLowerCase('ko').includes(keyword)) : items
  }, [items, query])
  return (
    <>
      <header style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
          <h1 className="t-title-1">내 채팅</h1>
        <button type="button" onClick={() => setManaging((value) => !value)} aria-label="대화 관리" aria-pressed={managing} style={{
          width: 40, height: 40, display: 'grid', placeItems: 'center', padding: 0, border: 0, borderRadius: 'var(--radius-sm)',
          background: managing ? 'var(--color-surface-2)' : 'transparent', color: 'var(--color-text-primary)',
        }}>
          <svg aria-hidden width="22" height="22" viewBox="0 0 18 18" fill="currentColor">
            <circle cx="3" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="15" cy="9" r="1.5" />
          </svg>
        </button>
        </div>
      </header>
      <label style={{ position: 'relative', display: 'block', marginBottom: 'var(--space-5)' }}>
        <span className="sr-only">캐릭터 이름으로 검색</span>
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }}>
          <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" />
        </svg>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="캐릭터 이름으로 검색" style={{
          width: '100%', minHeight: 52, padding: '0 16px 0 46px', border: 0, outline: 0,
          borderRadius: 'var(--radius-lg)', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)',
        }} />
      </label>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
        <AnimatePresence initial={false}>
        {filtered.map((s) => {
          const portrait = s.characterImages[0] ?? null
          return (
          <motion.li key={s.id} data-session-row data-status={s.status} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12, transition: tween.exit }} transition={spring.default}
            style={{ position: 'relative', padding: '10px 12px', borderRadius: 'var(--radius-lg)', background: 'rgba(255, 255, 255, 0.035)' }}>
            <TransitionLink href={`/chat/${s.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 68 }}>
              <div aria-hidden style={{ width: 56, height: 56, borderRadius: 18, overflow: 'hidden', flexShrink: 0, background: 'var(--color-surface-2)', display: 'grid', placeItems: 'center' }}>
                {portrait
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={portrait} alt="" width={56} height={56} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span className="t-name" style={{ fontSize: 22, color: s.accentA ?? 'var(--color-text-tertiary)', opacity: 0.8 }}>{s.characterName.slice(0, 1)}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <h2 className="t-name" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 16, lineHeight: 1.35 }}>
                    {s.characterName}
                  </h2>
                </div>
                <p className="t-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4 }}>{s.lastMessage ?? s.characterStatus ?? `${s.location} · ${s.time}`}</p>
              </div>
              <div style={{ width: 44, minHeight: 54, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 7 }}>
                <time className="t-micro" dateTime={new Date(s.lastInteractionAt).toISOString()} style={{ textTransform: 'none', letterSpacing: 0, whiteSpace: 'nowrap' }}>{dateLabel(s.lastInteractionAt)}</time>
                {s.unread > 0 && <span data-unread aria-label={`안 읽은 메시지 ${s.unread}개`} className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, minWidth: 21, height: 21, padding: '0 6px', borderRadius: 11, background: 'var(--color-danger)', color: 'var(--color-white)', display: 'grid', placeItems: 'center' }}>{s.unread}</span>}
              </div>
            </TransitionLink>
            {managing && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)' }}>
                <ButtonLink href={`/archive/delete/${s.id}`} size="sm" variant="danger" aria-label={`${s.characterName}와의 역할극 삭제`}>삭제</ButtonLink>
              </div>
            )}
          </motion.li>
          )
        })}
        </AnimatePresence>
      </ul>
      {filtered.length === 0 && <p className="empty-state empty-state--fill">해당 이름의 캐릭터가 없어요</p>}
    </>
  )
}
function dateLabel(d: Date | string) {
  const date = new Date(d)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (day === start) return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
  if (day === start - 86_400_000) return '어제'
  return `${date.getMonth() + 1}.${date.getDate()}`
}
