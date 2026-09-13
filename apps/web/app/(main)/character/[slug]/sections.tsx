'use client'
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button, TextArea, TransitionLink, useToast } from '@/components/ui'
import { CharacterVisual, portraitFor } from '@/components/character-visual'
import { duration, ease, press, spring } from '@/lib/motion/tokens'
import type { CommentItem } from '@/lib/social'
import { bookmark, deleteComment, postComment } from './social-actions'

/** 구분선으로 나뉜 한 덩이. 스크롤하며 차례로 떠오른다. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: duration.slow, ease: ease.enter }}
      style={{ padding: 'var(--space-6) 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <h2 className="t-title-3" style={{ marginBottom: 12 }}>{title}</h2>
      {children}
    </motion.section>
  )
}

/** 통계 칩 — 숫자가 있는 것만 띄운다. */
export function Stat({ icon, label }: { icon: 'chat' | 'book' | 'comment'; label: string }) {
  const path = icon === 'book'
    ? <path d="M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
    : <path d="M12 3C6.9 3 2.8 6.6 2.8 11c0 2.5 1.3 4.7 3.4 6.2L5 21.4l4.6-2.2c.8.2 1.6.3 2.4.3 5.1 0 9.2-3.6 9.2-8s-4.1-8.5-9.2-8.5z" />
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8,
      background: 'var(--color-surface-2)', fontSize: 'var(--font-caption)', color: 'var(--color-text-secondary)',
    }}>
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24"
        fill={icon === 'book' ? 'none' : 'var(--color-danger)'}
        stroke={icon === 'book' ? 'currentColor' : 'none'} strokeWidth="1.75" strokeLinejoin="round">
        {path}
      </svg>
      {label}
    </span>
  )
}

/** 같은 장르의 다른 캐릭터. 홈의 행과 같은 카드 언어를 쓴다. */
export function SimilarRow({ items }: {
  items: Array<{ id: string; slug: string | null; name: string; role: string | null; tagline: string | null; accentA: string | null }>
}) {
  const reduce = useReducedMotion()
  return (
    <div className="row-scroll">
      {items.map((c) => (
        <motion.div key={c.id} whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}>
          <TransitionLink href={`/character/${c.slug}`} aria-label={c.name}
            style={{ display: 'block', position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug ?? c.id} photo={portraitFor(c.slug ?? '')} ratio="10 / 16" />
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0, padding: '28px 12px 12px',
              background: 'linear-gradient(to top, rgba(8,8,9,0.94) 28%, rgba(8,8,9,0))',
            }}>
              <p className="t-body t-name" style={{ fontWeight: 'var(--weight-bold)' }}>{c.name}</p>
              {c.tagline && (
                <p className="t-caption" style={{
                  color: 'var(--color-text-secondary)', marginTop: 2,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{c.tagline}</p>
              )}
            </div>
          </TransitionLink>
        </motion.div>
      ))}
    </div>
  )
}

/** 북마크. 눌린 즉시 상태가 바뀌고, 서버가 확정한다. */
export function BookmarkButton({ slug, saved }: { slug: string; saved: boolean }) {
  const [on, setOn] = useState(saved)
  const toast = useToast()
  const reduce = useReducedMotion()
  return (
    <form action={async () => { setOn((v) => !v); await bookmark(slug); toast(on ? '보관함에서 뺐어요.' : '보관함에 담았어요.') }}>
      <motion.button type="submit" aria-pressed={on} aria-label={on ? '보관함에서 빼기' : '보관함에 담기'}
        whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', minHeight: 32,
          borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 'var(--font-caption)',
          background: on ? 'var(--color-white)' : 'var(--color-surface-2)',
          color: on ? 'var(--color-black)' : 'var(--color-text-secondary)',
        }}>
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </svg>
        {on ? '보관함에 있음' : '보관하기'}
      </motion.button>
    </form>
  )
}

/** 댓글. 비로그인도 읽을 수 있고, 쓰려 할 때 로그인으로 보낸다. */
export function Comments({ slug, items, signedIn }: { slug: string; items: CommentItem[]; signedIn: boolean }) {
  const [body, setBody] = useState('')
  const toast = useToast()
  return (
    <div className="stack" style={{ gap: 14 }}>
      <form action={async (f) => { await postComment(slug, f); setBody(''); if (signedIn) toast('댓글을 남겼어요.') }}
        className="stack" style={{ gap: 8 }}>
        <TextArea name="body" rows={2} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={signedIn ? '이 캐릭터에 대해 남겨보세요' : '로그인하고 댓글을 남겨보세요'} aria-label="댓글 입력" />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" size="sm" variant="secondary" disabled={signedIn && !body.trim()}>등록</Button>
        </div>
      </form>

      {items.length === 0
        ? <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>아직 댓글이 없어요.</p>
        : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 12 }}>
            <AnimatePresence initial={false}>
              {items.map((c) => (
                <motion.li key={c.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10, transition: { duration: duration.fast, ease: ease.exit } }}
                  transition={spring.default}
                  style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <span className="t-caption" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>@{c.authorName}</span>
                    <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, flexShrink: 0 }}>{day(c.createdAt)}</span>
                  </div>
                  <p className="t-caption" style={{ lineHeight: 1.6, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
                  {c.mine && (
                    <form action={async () => { await deleteComment(slug, c.id); toast('댓글을 지웠어요.') }} style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button type="submit" size="sm" variant="ghost">삭제</Button>
                    </form>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
    </div>
  )
}

const day = (d: Date) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
