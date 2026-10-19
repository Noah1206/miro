'use client'
import { motion, useReducedMotion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { characterTags } from '@/lib/character-card-copy'
import { characterTagFont } from '@/lib/character-tag-font'
import { press, spring } from '@/lib/motion/tokens'

/** 카드가 그리는 것. 홈의 행과 상세의 '비슷한 작품' 이 같은 모양이어야 한다. */
export type CardCharacter = {
  startingContext?: string | null
  occupation?: string | null
  contactEnabled?: boolean | null
  id: string
  slug: string | null
  name: string
  tagline: string | null
  accentA: string | null
  genre: string | null
  relationshipKeywords: string[]
  /** 사용자가 올린 사진. 첫 번째가 대표. */
  images: string[]
  /** 진행 중인 역할극이면 그 세션으로 바로 들어간다. */
  sessionId?: string | null
  /** 접근성 이름에 덧붙일 한 줄 (역할·현재 상태). */
  caption?: string | null
  /** 목적지를 직접 정할 때 (임시저장은 상세가 없어 편집 화면으로 보낸다). */
  href?: string
}

/**
 * 캐릭터 카드 하나.
 * 이미지 안쪽 아래에 이름·한 줄·해시태그를 둔다(10/19). 대화 인원은 띄우지 않는다.
 * 마크업을 한 곳에 두어야 홈과 상세가 어긋나지 않는다 (실제로 어긋났었다).
 */
export function CharacterCard({ c }: { c: CardCharacter; tagsBelow?: boolean }) {
  const reduce = useReducedMotion()
  const slug = c.slug ?? c.id
  const tags = characterTags(c)
  return (
    <motion.div whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}>
      <TransitionLink href={c.href ?? `/character/${slug}`}
        aria-label={`${c.name}${c.caption ? `, ${c.caption}` : ''}`}
        style={{ display: 'block', minWidth: 0 }}>
        {/* 10/19: 이름·한 줄·태그를 사진 안쪽 아래에 — 아래로 갈수록 어두워지는 그늘 위에 흰 글씨. */}
        <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <CharacterVisual name={c.name} accent={c.accentA} slug={slug} photo={c.images[0] ?? null} ratio="4 / 5" scrim={false} />
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, padding: '12px 12px 12px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 68%, rgba(0,0,0,0.9) 100%)', color: '#fff',
          }}>
            <p className="t-body t-name" style={{ fontWeight: 'var(--weight-bold)', fontSize: 18, lineHeight: 1.25, letterSpacing: '-.025em', overflowWrap: 'anywhere', margin: 0 }}>{c.name}</p>
            {c.tagline && (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{c.tagline}”</p>
            )}
            {tags.length > 0 && (
              <p className={`t-micro ${characterTagFont.className}`} style={{
                color: 'rgba(255,255,255,0.6)', margin: 0, letterSpacing: 0, textTransform: 'none', fontSize: 11, lineHeight: 1.5, overflow: 'hidden', whiteSpace: 'nowrap',
              }}>{tags.map(tag => <span key={tag} style={{ marginRight: 6 }}>#{tag}</span>)}</p>
            )}
          </div>
        </div>
      </TransitionLink>
    </motion.div>
  )
}
