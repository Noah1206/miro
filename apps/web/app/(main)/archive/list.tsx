'use client'
import { AnimatePresence, motion } from 'motion/react'
import { Button, ButtonLink, TransitionLink, useToast } from '@/components/ui'
import { spring, tween } from '@/lib/motion/tokens'
import type { ArchiveItem } from '@/lib/ops/archive'

/**
 * 항목이 사라지면 아래가 올라온다 (Layout Animation). 관계 수치는 어디에도 없다.
 * 보관/복원은 서버 액션. 눌린 즉시 토스트로 확인.
 */
export function ArchiveList({ items, archived, archiveAction, restoreAction }: {
  items: ArchiveItem[]; archived: boolean
  archiveAction: (id: string) => Promise<void>; restoreAction: (id: string) => Promise<void>
}) {
  const toast = useToast()
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>
      <AnimatePresence initial={false}>
        {items.map((s) => (
          <motion.li key={s.id} data-session-row layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12, transition: tween.exit }} transition={spring.default}
            className="hoverable" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
            <TransitionLink href={`/chat/${s.id}`} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div aria-hidden style={{ width: 52, height: 64, borderRadius: 'var(--radius-sm)', flexShrink: 0, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', display: 'grid', placeItems: 'center' }}>
                <span className="t-name" style={{ fontSize: 22, color: s.accentA ?? 'var(--color-text-tertiary)', opacity: 0.8 }}>{s.characterName.slice(0, 1)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <h2 className="t-title-3 t-name">{s.characterName}</h2>
                  <p className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, flexShrink: 0 }}>{ago(s.lastInteractionAt)}</p>
                </div>
                <p className="t-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{s.characterStatus ?? `${s.location} · ${s.time}`}</p>
              </div>
              {s.unread > 0 && <span data-unread className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, minWidth: 22, height: 22, padding: '0 7px', borderRadius: 11, background: 'var(--color-relationship)', color: '#fff', display: 'grid', placeItems: 'center' }}>{s.unread}</span>}
            </TransitionLink>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
              <form action={async () => { await (archived ? restoreAction : archiveAction)(s.id); toast(archived ? '다시 이어집니다.' : '조용히 보관했어요.') }}>
                <Button type="submit" size="sm" variant="ghost">{archived ? '복원' : '보관'}</Button>
              </form>
              <ButtonLink href={`/archive/delete/${s.id}`} size="sm" variant="danger" aria-label={`${s.characterName}와의 역할극 삭제`}>삭제</ButtonLink>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
function ago(d: Date | string) {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000)
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`; if (m < 1440) return `${Math.floor(m / 60)}시간 전`; return `${Math.floor(m / 1440)}일 전`
}
