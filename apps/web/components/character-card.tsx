'use client'
import { motion, useReducedMotion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { CharacterVisual, portraitFor } from '@/components/character-visual'
import { press, spring } from '@/lib/motion/tokens'
import { compact } from '@/lib/format'

/** 카드가 그리는 것. 홈의 행과 상세의 '비슷한 작품' 이 같은 모양이어야 한다. */
export type CardCharacter = {
  id: string
  slug: string | null
  name: string
  tagline: string | null
  accentA: string | null
  genre: string | null
  relationshipKeywords: string[]
  /** 사용자가 올린 사진. 첫 번째가 대표. 공식 캐릭터는 비어 있고 portraitFor(slug) 가 대신한다. */
  images: string[]
  /** 대화한 사람 수. 0 이면 배지를 띄우지 않는다. */
  plays: number
  /** 진행 중인 역할극이면 그 세션으로 바로 들어간다. */
  sessionId?: string | null
  /** 접근성 이름에 덧붙일 한 줄 (역할·현재 상태). */
  caption?: string | null
  /** 목적지를 직접 정할 때 (임시저장은 상세가 없어 편집 화면으로 보낸다). */
  href?: string
}

/**
 * 캐릭터 카드 하나.
 * 포스터 위에 조회수 → 이름 → 캐릭터의 한 줄 → 해시태그를 얹는다.
 * 마크업을 한 곳에 두어야 홈과 상세가 어긋나지 않는다 (실제로 어긋났었다).
 */
export function CharacterCard({ c }: { c: CardCharacter }) {
  const reduce = useReducedMotion()
  const slug = c.slug ?? c.id
  const tags = hashtags(c)
  return (
    <motion.div whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}>
      <TransitionLink href={c.href ?? (c.sessionId ? `/chat/${c.sessionId}` : `/character/${slug}`)}
        aria-label={`${c.name}${c.caption ? `, ${c.caption}` : ''}`}
        style={{ display: 'block', position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <CharacterVisual name={c.name} accent={c.accentA} slug={slug} photo={portraitFor(slug) ?? c.images[0] ?? null} ratio="10 / 16" />

        {/* 조회수는 실제로 대화한 사람이 있을 때만 — 0 을 보여주면 아무도 안 쓴다는 말이 된다. */}
        {c.plays > 0 && (
          <span style={{
            position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 7px', borderRadius: 7, background: 'rgba(70,70,78,0.45)',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            fontSize: 'var(--font-micro)', color: 'var(--color-text-primary)', letterSpacing: 0,
            fontWeight: 'var(--weight-semibold)',
          }}>
            <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="var(--color-danger)">
              <path d="M12 3C6.9 3 2.8 6.6 2.8 11c0 2.5 1.3 4.7 3.4 6.2L5 21.4l4.6-2.2c.8.2 1.6.3 2.4.3 5.1 0 9.2-3.6 9.2-8s-4.1-8.5-9.2-8.5z" />
            </svg>
            {compact(c.plays)}
          </span>
        )}

        {/* 캐릭터가 사진·통화·영상통화로 현실까지 이어진다는 신호. 내비게이션과 같은 선 아이콘 규칙. */}
        <span aria-hidden style={{
          position: 'absolute', top: 10, right: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 6px', borderRadius: 7, background: 'rgba(70,70,78,0.45)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: 'var(--color-text-primary)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" />
          </svg>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 5.5c0-1 .8-1.5 1.7-1.5H8c.8 0 1.4.5 1.6 1.2l.8 2.7c.2.6 0 1.3-.5 1.7L9 10.7c1 2.3 2.9 4.2 5.3 5.3l1.1-.9c.4-.5 1.1-.7 1.7-.5l2.7.8c.7.2 1.2.8 1.2 1.6v1.8c0 .9-.5 1.7-1.5 1.7C13.5 20.5 4.5 11.5 4.5 5.5z" />
          </svg>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10.5 21 7v10l-6-3.5z" />
          </svg>
        </span>

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
    </motion.div>
  )
}

/** 해시태그는 장르와 관계 키워드에서 만든다 — 따로 입력받지 않는다. */
function hashtags(c: CardCharacter): string[] {
  const fromGenre = (c.genre ?? '').split('·').map((g) => g.trim().replace(/\s+/g, '')).filter(Boolean)
  return [...fromGenre, ...c.relationshipKeywords.map((k) => k.replace(/\s+/g, ''))].slice(0, 5)
}
