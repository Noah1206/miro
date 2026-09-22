'use client'
import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Tabs, useToast } from '@/components/ui'
import type { CommentItem } from '@/lib/social'
import { duration, ease } from '@/lib/motion/tokens'
import { postComment, deleteComment, likeComment } from '../social-actions'

/** 알약형 한 줄 입력창 — 플레이스홀더 + 원형 전송 버튼 (레퍼런스). */
function Composer({ name, placeholder, value, onChange, disabled, parentId }: {
  name: string; placeholder: string; value: string; onChange: (v: string) => void; disabled?: boolean; parentId?: string
}) {
  // 전송 중에는 다시 못 누른다 (§7.2) — 연타로 같은 댓글이 두 번 올라가지 않게.
  const { pending } = useFormStatus()
  const off = disabled || pending
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px 10px 16px', background: 'var(--color-surface-1)', borderRadius: 999 }}>
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={500} placeholder={placeholder}
        aria-label={placeholder} autoComplete="off" disabled={pending}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--color-text-primary)', fontSize: 'var(--font-body-size)' }} />
      <button type="submit" disabled={off} aria-busy={pending || undefined} aria-label="전송" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 22,
        border: 0, flexShrink: 0, background: 'var(--color-white)', color: 'var(--color-black)',
        cursor: off ? 'default' : 'pointer', opacity: off ? 0.4 : 1,
      }}>
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  )
}

/** 정렬 탭 + 입력창 + 스레드 목록. 탭은 쿼리로 서버 정렬을 바꾼다(하드 네비게이션 아님 — Tabs 가 Link 를 쓴다). */
export function CommentThread({ slug, items, sort, signedIn }: {
  slug: string; items: CommentItem[]; sort: 'popular' | 'recent'; signedIn: boolean
}) {
  const [body, setBody] = useState('')
  const toast = useToast()

  return (
    <div className="stack" style={{ gap: 16, flex: items.length === 0 ? 1 : undefined }}>
      <form action={async (f) => { await postComment(slug, f); setBody(''); if (signedIn) toast('댓글을 남겼어요.') }}>
        <Composer name="body" value={body} onChange={setBody} disabled={signedIn && !body.trim()}
          placeholder={signedIn ? '이 캐릭터에 대해 남겨보세요' : '로그인하고 댓글을 남겨보세요'} />
      </form>

      <Tabs id="comment-sort"
        tabs={[
          { key: 'popular', label: '인기순', href: `/character/${slug}/comments?sort=popular` },
          { key: 'recent', label: '최신순', href: `/character/${slug}/comments?sort=recent` },
        ]}
        active={sort} />

      {items.length === 0
        ? <p className="empty-state empty-state--fill">아직 댓글이 없어요</p>
        : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 20 }}>
            {items.map((c) => <ThreadItem key={c.id} slug={slug} c={c} signedIn={signedIn} />)}
          </ul>
        )}
    </div>
  )
}

function ThreadItem({ slug, c, signedIn }: { slug: string; c: CommentItem; signedIn: boolean }) {
  const [replying, setReplying] = useState(false)
  const [showReplies, setShowReplies] = useState(c.replies.length <= 2)
  return (
    <li>
      <CommentRow slug={slug} c={c} onReply={() => setReplying((v) => !v)} />
      {replying && <ReplyForm slug={slug} parentId={c.id} signedIn={signedIn} onDone={() => setReplying(false)} />}

      {c.replies.length > 0 && (
        <div style={{ marginLeft: 36, marginTop: 10, borderLeft: '2px solid var(--color-border)', paddingLeft: 14 }}>
          {!showReplies ? (
            <button type="button" onClick={() => setShowReplies(true)} className="t-caption hit"
              style={{ background: 'none', border: 0, padding: 0, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
              답글 {c.replies.length}개 더보기
            </button>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 14 }}>
              {c.replies.map((r) => <li key={r.id}><CommentRow slug={slug} c={r} /></li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function CommentRow({ slug, c, onReply }: { slug: string; c: CommentItem; onReply?: () => void }) {
  const [liked, setLiked] = useState(c.liked)
  const [likeCount, setLikeCount] = useState(c.likeCount)
  const toast = useToast()
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span aria-hidden style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--color-surface-2)', flexShrink: 0 }} />
        <span className="t-caption" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>@{c.authorName}</span>
        <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{day(c.createdAt)}</span>
      </div>
      <p className="t-body" style={{ lineHeight: 1.5, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', margin: 0 }}>{c.body}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
        <button type="button" className="hit" aria-pressed={liked} aria-label={liked ? '좋아요 취소' : '좋아요'}
          onClick={async () => { setLiked((v) => !v); setLikeCount((n) => n + (liked ? -1 : 1)); await likeComment(slug, c.id) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: liked ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
            <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2.3 5 5.8 5c2 0 3.4 1 4.2 2.3C10.8 6 12.2 5 14.2 5c3.5 0 5.3 3.4 3.8 6.9-2.5 4.5-10 9.1-10 9.1z" />
          </svg>
          <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{likeCount}</span>
        </button>
        {onReply && (
          <button type="button" onClick={onReply} className="t-caption hit"
            style={{ background: 'none', border: 0, padding: 0, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
            답글 달기
          </button>
        )}
        {c.mine && (
          <form action={async () => { await deleteComment(slug, c.id); toast('댓글을 지웠어요.') }} style={{ marginLeft: 'auto' }}>
            <button type="submit" className="t-micro hit" style={{ background: 'none', border: 0, padding: 0, textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>삭제</button>
          </form>
        )}
      </div>
    </div>
  )
}

function ReplyForm({ slug, parentId, signedIn, onDone }: { slug: string; parentId: string; signedIn: boolean; onDone: () => void }) {
  const [body, setBody] = useState('')
  const reduce = useReducedMotion()
  return (
    <motion.form initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: duration.fast, ease: ease.enter }}
      action={async (f) => { await postComment(slug, f); setBody(''); onDone() }}
      className="stack" style={{ gap: 6, marginTop: 10, marginLeft: 36 }}>
      <Composer name="body" parentId={parentId} value={body} onChange={setBody} disabled={signedIn && !body.trim()}
        placeholder={signedIn ? '답글 남기기' : '로그인하고 답글을 남겨보세요'} />
      <button type="button" onClick={onDone} className="t-caption hit"
        style={{ alignSelf: 'flex-end', background: 'none', border: 0, padding: '0 8px', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
        취소
      </button>
    </motion.form>
  )
}

const day = (d: Date) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
