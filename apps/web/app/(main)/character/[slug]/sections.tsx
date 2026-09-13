'use client'
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button, TextArea, TransitionLink, useToast } from '@/components/ui'
import { CharacterCard, type CardCharacter } from '@/components/character-card'
import { duration, ease, press, spring } from '@/lib/motion/tokens'
import type { CommentItem } from '@/lib/social'
import { bookmark, deleteComment, postComment } from './social-actions'

/**
 * 한 덩이. 스크롤하며 차례로 떠오른다.
 * 구분선은 두지 않는다 — 제목 크기와 간격이 이미 경계를 만든다.
 */
export function Section({ title, image, noBg, divider, children }: { title: string; image?: string | null; noBg?: boolean; divider?: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }} transition={{ duration: duration.slow, ease: ease.enter }}
      style={noBg
        ? {
          marginTop: divider ? 'var(--space-7)' : 'var(--space-6)',
          paddingTop: divider ? 'var(--space-6)' : 0,
          borderTop: divider ? '1px solid var(--color-border)' : undefined,
        }
        : {
          marginTop: 'var(--space-6)', padding: 'var(--space-5)',
          background: 'var(--color-surface-1)', borderRadius: 'var(--radius-lg)',
        }}>
      <h2 className="t-title-2" style={{ marginBottom: 14 }}>{title}</h2>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" width={1024} height={576} loading="lazy" decoding="async"
          style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-lg)', marginBottom: 16, display: 'block' }} />
      )}
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
  turns: Array<{ role: 'character' | 'user'; text: string }>
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
            : { display: 'flex', gap: 10, alignItems: 'flex-start' }}>
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
function Line({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean)
  return (
    <p className="t-body" style={{ lineHeight: 1.5, color: 'var(--color-text-primary)', margin: 0 }}>
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*')
          ? <em key={i} style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>{part.slice(1, -1)}</em>
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
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7,
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

/**
 * 와우 포인트: 이 캐릭터가 앱 밖에서도 먼저 연락하고, 사진·통화·영상통화·Live Scene 으로
 * 관계가 현실까지 이어진다는 걸 진입 전에 알려준다. 문구가 아니라 아이콘 3개로 즉시 읽히게.
 */
export function RealityStrip() {
  const items: Array<{ icon: string; label: string }> = [
    { icon: '📷', label: '사진' },
    { icon: '🎙️', label: '음성통화' },
    { icon: '🎬', label: '영상통화' },
  ]
  return (
    <div style={{
      display: 'flex', gap: 8, padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface-1)',
    }}>
      {items.map((item) => (
        <span key={item.label} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          fontSize: 'var(--font-caption)', color: 'var(--color-text-secondary)',
        }}>
          <span aria-hidden style={{ fontSize: 20 }}>{item.icon}</span>
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
export function BookmarkButton({ slug, saved }: { slug: string; saved: boolean }) {
  const [on, setOn] = useState(saved)
  const toast = useToast()
  const reduce = useReducedMotion()
  return (
    <form action={async () => { setOn((v) => !v); await bookmark(slug); toast(on ? '보관함에서 뺐어요.' : '보관함에 담았어요.') }}>
      <motion.button type="submit" aria-pressed={on} aria-label={on ? '보관함에서 빼기' : '보관함에 담기'}
        whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', minHeight: 32,
          borderRadius: 7, border: 0, cursor: 'pointer', fontSize: 'var(--font-caption)',
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
                  <p className="t-caption" style={{ lineHeight: 1.5, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
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
