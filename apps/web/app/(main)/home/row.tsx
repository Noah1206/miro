'use client'
import { motion, useReducedMotion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { CharacterVisual, portraitFor } from '@/components/character-visual'
import { duration, ease, press, spring, stagger } from '@/lib/motion/tokens'
import type { HomeCard, HomeRow } from '@/lib/home'

/**
 * 주제를 가진 가로 스크롤 행.
 * 스냅·관성·러버밴드는 브라우저(scroll-snap)에 맡긴다 — 직접 구현하면 기기마다 다르게 느껴진다.
 */
export function Row({ row, index }: { row: HomeRow; index: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.section aria-labelledby={`row-${row.key}`}
      initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: ease.enter, delay: 0.08 * index }}
      style={{ marginBottom: 'var(--space-7)' }}>
      <h2 id={`row-${row.key}`} className="t-title-2"
        style={{ padding: '0 var(--space-5)', marginBottom: 14 }}>{row.title}</h2>
      <div className="row-scroll">
        {row.items.map((c, i) => (
          <motion.div key={`${row.key}-${c.id}`}
            initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: duration.normal, ease: ease.enter, delay: 0.08 * index + stagger.tight * i }}>
            <motion.div whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}>
              <Card c={c} />
            </motion.div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}

/** 포스터 위에 정보를 얹는다: 조회수(있을 때) → 이름 → 캐릭터의 한 줄 → 해시태그. */
function Card({ c }: { c: HomeCard }) {
  const tags = hashtags(c)
  return (
    <TransitionLink href={c.sessionId ? `/chat/${c.sessionId}` : `/character/${c.slug}`}
      aria-label={`${c.name}${c.caption ? `, ${c.caption}` : ''}`}
      style={{ display: 'block', position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug} photo={portraitFor(c.slug)} ratio="10 / 16" />

      {/* 조회수는 실제로 대화한 사람이 있을 때만 — 0 을 보여주면 아무도 안 쓴다는 말이 된다. */}
      {c.plays > 0 && (
        <span style={{
          position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 10px', borderRadius: 8, background: 'rgba(70,70,78,0.45)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          fontSize: 'var(--font-micro)', color: 'var(--color-text-primary)', letterSpacing: 0,
          fontWeight: 'var(--weight-semibold)',
        }}>
          {/* 채운 말풍선 — 윤곽선만 있으면 속이 비어 보인다. */}
          <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="var(--color-danger)">
            <path d="M12 3C6.9 3 2.8 6.6 2.8 11c0 2.5 1.3 4.7 3.4 6.2L5 21.4l4.6-2.2c.8.2 1.6.3 2.4.3 5.1 0 9.2-3.6 9.2-8s-4.1-8.5-9.2-8.5z" />
          </svg>
          {compact(c.plays)}
        </span>
      )}

      {/* 아래 절반을 덮는 그라디언트 위에 글을 올린다 — 이미지가 밝아도 글이 읽힌다. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 12px 12px',
        background: 'linear-gradient(to top, rgba(8,8,9,0.94) 28%, rgba(8,8,9,0.72) 60%, rgba(8,8,9,0))',
      }}>
        <p className="t-body t-name" style={{ fontWeight: 'var(--weight-bold)', marginBottom: 3 }}>{c.name}</p>
        {c.tagline && (
          <p className="t-caption" style={{
            color: 'var(--color-text-primary)', lineHeight: 1.45, marginBottom: 6,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{c.tagline}</p>
        )}
        {tags.length > 0 && (
          <p className="t-micro" style={{
            color: 'var(--color-text-tertiary)', letterSpacing: 0, textTransform: 'none',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{tags.map((t) => `#${t}`).join(' ')}</p>
        )}
      </div>
    </TransitionLink>
  )
}

/** 해시태그는 장르와 관계 키워드에서 만든다 — 따로 입력받지 않는다. */
function hashtags(c: HomeCard): string[] {
  const fromGenre = (c.genre ?? '').split('·').map((g) => g.trim().replace(/\s+/g, '')).filter(Boolean)
  return [...fromGenre, ...c.relationshipKeywords.map((k) => k.replace(/\s+/g, ''))].slice(0, 5)
}

/** 96.1만 처럼. 초기에는 0 이라 아예 표시하지 않는다. */
function compact(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1).replace(/\.0$/, '')}만`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}천`
  return String(n)
}
