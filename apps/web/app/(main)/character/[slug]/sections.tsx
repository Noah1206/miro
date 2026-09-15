'use client'
import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { TransitionLink, useToast } from '@/components/ui'
import { CharacterCard, type CardCharacter } from '@/components/character-card'
import { duration, ease, press, spring } from '@/lib/motion/tokens'
import type { CommentItem } from '@/lib/social'
import { likeCharacter, bookmark, deleteComment, likeComment } from './social-actions'

/**
 * 한 덩이.
 *
 * 카드로 감싸지 않는다 — 카드를 쌓으면 어느 것이 중요한지 사라진다. 대신 왼쪽에 짧은
 * 규칙선을 세우고 라벨을 작게 얹는다. 선은 무채색이다 — 구역을 나누는 일은 상태가 아니라
 * 구조이고, 라임은 상태에만 쓴다.
 */
export function Rule({ label, action, children, accent }: { label: string; action?: React.ReactNode; children: React.ReactNode; accent?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: duration.slow, ease: ease.enter }}
      style={{ marginTop: 'var(--space-7)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span aria-hidden style={{ width: 3, height: 15, borderRadius: 2, background: accent ?? 'var(--color-border-strong)', flexShrink: 0 }} />
        <h2 className="t-title-3" style={{ flex: 1 }}>{label}</h2>
        {action}
      </div>
      {children}
    </motion.section>
  )
}

/**
 * 상황 예시 — 이 캐릭터와의 대화가 어떤 느낌인지 보여준다.
 * 채팅 화면과 같은 문장 규칙을 쓴다: *별표* 안은 서술(기울임·2차 톤), 나머지는 대사.
 * 사용자 말은 오른쪽 버블 — 실제 대화에서 보게 될 모양 그대로여야 한다.
 */
export function SampleDialogue({ name, portrait, turns }: {
  name: string; portrait: string | null
  turns: Array<{ role: 'character' | 'user' | 'narrator'; text: string }>
}) {
  const reduce = useReducedMotion()
  return (
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 14 }}>
      {turns.map((t, i) => (
        <motion.li key={i}
          initial={reduce ? false : { opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-5% 0px' }}
          transition={{ duration: duration.normal, ease: ease.enter, delay: i * 0.08 }}
          style={t.role === 'user'
            ? { display: 'flex', justifyContent: 'flex-end' }
            : t.role === 'narrator'
              ? { display: 'flex', justifyContent: 'center', padding: '0 8%' }
              : { display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {t.role === 'narrator' && (
            <p className="t-caption" style={{ margin: 0, textAlign: 'center', color: 'var(--color-text-secondary)', fontStyle: 'italic', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{t.text}</p>
          )}
          {t.role === 'character' && (
            <>
              {portrait
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={portrait} alt="" width={34} height={34} loading="lazy"
                    style={{ width: 34, height: 34, borderRadius: 17, objectFit: 'cover', objectPosition: 'center 20%', flexShrink: 0 }} />
                : <span aria-hidden style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--color-surface-2)', flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <p className="t-caption" style={{ color: 'var(--color-text-tertiary)', marginBottom: 4 }}>{name}</p>
                <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '10px 13px', maxWidth: '85%', display: 'inline-block' }}>
                  <Line text={t.text} />
                </div>
              </div>
            </>
          )}
          {t.role === 'user' && (
            <div style={{ background: 'var(--color-surface-3)', borderRadius: 'var(--radius-md)', padding: '10px 13px', maxWidth: '78%' }}>
              <Line text={t.text} />
            </div>
          )}
        </motion.li>
      ))}
    </ul>
  )
}

/** *별표* 로 감싼 부분은 서술 — 채팅 화면과 같은 규칙. */
export function Line({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean)
  return (
    <p className="t-body" style={{ lineHeight: 1.5, color: 'var(--color-text-primary)', margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*')
          ? <em key={i} style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>{part.startsWith('**') ? part.slice(2, -2) : part.slice(1, -1)}</em>
          : <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>,
      )}
    </p>
  )
}

/**
 * 캐릭터 사진 갤러리. 가로 스크롤 — 스냅과 관성은 브라우저에 맡긴다.
 * 장식이 아니라 '이 사람이 어떤 순간들을 갖는가' 를 보여주는 자리다.
 */
export function Gallery({ name, images }: { name: string; images: string[] }) {
  const reduce = useReducedMotion()
  return (
    // 안에 초점 가능한 요소가 없는 스크롤 영역이라 스스로 초점을 받아야 한다 —
    // 그러지 않으면 키보드만 쓰는 사람은 두 번째 사진부터 볼 수 없다 (WCAG 2.1.1).
    <div className="gallery-scroll" tabIndex={0} role="group" aria-label={`${name} 사진 ${images.length}장`}>
      {images.map((src, i) => (
        <motion.div key={src}
          initial={reduce ? false : { opacity: 0, x: 14 }} whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-5% 0px' }}
          transition={{ duration: duration.normal, ease: ease.enter, delay: i * 0.06 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${name} ${i + 1}번째 사진`} width={640} height={853} loading="lazy" decoding="async"
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)', display: 'block' }} />
        </motion.div>
      ))}
    </div>
  )
}

/** 통계 칩 — 숫자가 있는 것만 띄운다. */
export function Stat({ icon, label }: { icon: 'chat' | 'book' | 'comment'; label: string }) {
  // chat = 대화 인원 수 → 사람 아이콘. comment = 댓글 수 → 말풍선 아이콘.
  const path = icon === 'book'
    ? <path d="M4 4h9a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z" />
    : icon === 'chat'
      ? <path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      : <path d="M12 3C6.9 3 2.8 6.6 2.8 11c0 2.5 1.3 4.7 3.4 6.2L5 21.4l4.6-2.2c.8.2 1.6.3 2.4.3 5.1 0 9.2-3.6 9.2-8s-4.1-8.5-9.2-8.5z" />
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 6, height: 22, boxSizing: 'border-box', lineHeight: '18px',
      background: 'var(--color-surface-2)', fontSize: 12, color: 'var(--color-text-secondary)',
    }}>
      <svg aria-hidden width="14" height="14" viewBox="0 0 24 24"
        fill={icon === 'book' ? 'none' : 'currentColor'}
        stroke={icon === 'book' ? 'currentColor' : 'none'} strokeWidth="1.75" strokeLinejoin="round">
        {path}
      </svg>
      {label}
    </span>
  )
}

/**
 * 와우 포인트: 이 캐릭터가 앱 밖에서도 먼저 연락하고, 사진·통화·영상통화·Live Scene 으로
 * 관계가 현실까지 이어진다는 걸 진입 전에 알려준다. 문구가 아니라 아이콘 3개로 즉시 읽히게.
 */
export function RealityStrip() {
  // 내비게이션과 같은 선 아이콘 규칙: viewBox 24, stroke currentColor, strokeWidth 1.75 — 이모지 대신.
  const items: Array<{ label: string; icon: React.ReactNode }> = [
    { label: '사진', icon: <><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></> },
    { label: '음성통화', icon: <><path d="M4.5 5.5c0-1 .8-1.5 1.7-1.5H8c.8 0 1.4.5 1.6 1.2l.8 2.7c.2.6 0 1.3-.5 1.7L9 10.7c1 2.3 2.9 4.2 5.3 5.3l1.1-.9c.4-.5 1.1-.7 1.7-.5l2.7.8c.7.2 1.2.8 1.2 1.6v1.8c0 .9-.5 1.7-1.5 1.7C13.5 20.5 4.5 11.5 4.5 5.5z" /></> },
    { label: '영상통화', icon: <><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10.5 21 7v10l-6-3.5z" /></> },
  ]
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '12px 8px', borderRadius: 12,
      background: 'var(--color-surface-1)',
    }}>
      {items.map((item) => (
        <span key={item.label} style={{
          flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
          fontSize: 12, fontWeight: 500, letterSpacing: '-0.025em', whiteSpace: 'nowrap', color: 'var(--color-text-primary)',
        }}>
          <svg aria-hidden width="18" height="18" style={{ color: 'var(--color-accent)', flexShrink: 0 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
          {item.label}
        </span>
      ))}
    </div>
  )
}

/** 같은 장르의 다른 캐릭터. 홈의 행과 똑같은 카드를 쓴다. */
export function SimilarRow({ items }: { items: CardCharacter[] }) {
  return (
    <div className="row-scroll">
      {items.map((c) => <CharacterCard key={c.id} c={c} />)}
    </div>
  )
}

/** 북마크. 눌린 즉시 상태가 바뀌고, 서버가 확정한다. */
export function BookmarkButton({ slug, saved, iconOnly = false }: { slug?: string; saved: boolean; iconOnly?: boolean }) {
  const [on, setOn] = useState(saved)
  const toast = useToast()
  const reduce = useReducedMotion()
  return (
    <form action={async () => { if (!slug) return; setOn((v) => !v); await bookmark(slug); toast(on ? '보관함에서 뺐어요.' : '보관함에 담았어요.') }}>
      <motion.button type="submit" disabled={!slug} aria-pressed={on} aria-label={on ? '보관함에서 빼기' : '보관함에 담기'}
        whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 5px', minHeight: 22, height: 22, lineHeight: '18px',
          borderRadius: 7, border: 0, cursor: 'pointer', fontSize: 12,
          background: on ? 'var(--color-white)' : 'var(--color-surface-2)',
          color: on ? 'var(--color-black)' : 'var(--color-white)',
          ...(iconOnly ? { width: 42, height: 42, padding: 0, justifyContent: 'center', borderRadius: 10, background: 'var(--color-accent)', color: 'var(--color-white)' } : {}),
        }}>
        <svg aria-hidden width={iconOnly ? 24 : 14} height={iconOnly ? 24 : 14} viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </svg>
        {!iconOnly && (on ? '보관함에 있음' : '보관하기')}
      </motion.button>
    </form>
  )
}

/** 댓글. 비로그인도 읽을 수 있고, 쓰려 할 때 로그인으로 보낸다. */
/**
 * 상세 페이지의 댓글 미리보기. 카드 슬라이드 몇 개만 보여주고 '전체보기' 로 스레드 페이지를 연다
 * (레퍼런스 UI). 입력·답글·삭제는 전체보기 페이지에서만 — 여기는 훑어보는 자리다.
 */
export function CommentsPreview({ slug, items }: { slug: string; items: CommentItem[] }) {
  if (items.length === 0) {
    return <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>아직 댓글이 없어요.</p>
  }
  return (
    <div className="comment-scroll">
      {items.map((c) => <CommentCard key={c.id} slug={slug} c={c} preview />)}
    </div>
  )
}

/**
 * 댓글 카드 — 미리보기(고정 높이, clamp)와 전체 페이지(풀 텍스트) 둘 다에서 쓴다.
 * '더보기' 는 clamp 를 풀 뿐 실제 텍스트는 그대로다.
 */
export function CommentCard({ slug, c, preview }: { slug: string; c: CommentItem; preview?: boolean }) {
  const [liked, setLiked] = useState(c.liked)
  const [likeCount, setLikeCount] = useState(c.likeCount)
  const [expanded, setExpanded] = useState(false)
  const toast = useToast()
  const clamp = preview && !expanded
  return (
    <div style={{ background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span aria-hidden style={{ width: 26, height: 26, borderRadius: 13, background: 'var(--color-surface-2)', flexShrink: 0 }} />
        <span className="t-caption" style={{ color: 'var(--color-text-primary)', fontWeight: 'var(--weight-semibold)' }}>@{c.authorName}</span>
      </div>
      <p className="t-body" style={{
        lineHeight: 1.5, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', margin: 0,
        ...(clamp ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}),
      }}>{c.body}</p>
      {clamp && c.body.length > 60 && (
        <button type="button" onClick={() => setExpanded(true)} className="t-caption"
          style={{ background: 'none', border: 0, padding: 0, marginTop: 6, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
          더보기
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)' }}>{day(c.createdAt)}</span>
        <button type="button" aria-pressed={liked} aria-label={liked ? '좋아요 취소' : '좋아요'}
          onClick={async () => { setLiked((v) => !v); setLikeCount((n) => n + (liked ? -1 : 1)); await likeComment(slug, c.id) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: liked ? 'var(--color-danger)' : 'var(--color-text-tertiary)' }}>
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round">
            <path d="M12 21s-7.5-4.6-10-9.1C.5 8.4 2.3 5 5.8 5c2 0 3.4 1 4.2 2.3C10.8 6 12.2 5 14.2 5c3.5 0 5.3 3.4 3.8 6.9-2.5 4.5-10 9.1-10 9.1z" />
          </svg>
          <span className="t-micro" style={{ textTransform: 'none', letterSpacing: 0 }}>{likeCount}</span>
        </button>
        {c.mine && (
          <form action={async () => { await deleteComment(slug, c.id); toast('댓글을 지웠어요.') }} style={{ marginLeft: 'auto' }}>
            <button type="submit" className="t-micro" style={{ background: 'none', border: 0, padding: 0, textTransform: 'none', letterSpacing: 0, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>삭제</button>
          </form>
        )}
      </div>
    </div>
  )
}

const day = (d: Date) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

export function LikeButton({ overlay = false, slug, initial = { count: 0, liked: false } }: { overlay?: boolean; slug?: string; initial?: { count: number; liked: boolean } }) {
  const [state, setState] = useState(initial)
  const [pending, setPending] = useState(false)
  const toast = useToast()
  useEffect(() => setState(initial), [initial.count, initial.liked])
  return <button type="button" aria-label={state.liked ? '좋아요 취소' : '좋아요'} aria-pressed={state.liked} disabled={pending || !slug}
    onClick={async () => {
      if (!slug || pending) return
      setPending(true)
      try { setState(await likeCharacter(slug, !state.liked)) }
      catch { toast('좋아요를 저장하지 못했어요. 다시 시도해 주세요.') }
      finally { setPending(false) }
    }}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 5px', height: 22, border: 0, borderRadius: 6, fontSize: 12, lineHeight: '18px', background: 'var(--color-surface-2)', color: overlay ? 'var(--color-white)' : 'var(--color-text-secondary)', cursor: pending ? 'wait' : 'pointer', ...(overlay ? { height: 36, padding: '0 12px', borderRadius: 999, background: 'rgba(0,0,0,.65)', fontSize: 14 } : {}) }}>
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill={state.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
    {!overlay && '좋아요 '} {state.count}
  </button>
}
