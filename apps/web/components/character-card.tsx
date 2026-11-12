'use client'
import { motion, useReducedMotion } from 'motion/react'
import { TransitionLink } from '@/components/ui'
import { useLanguage } from '@/lib/i18n/client'
import { CharacterVisual } from '@/components/character-visual'
import { UnveilCover } from '@/components/unveil-badge'
import { characterTags } from '@/lib/character-card-copy'
import { press, spring } from '@/lib/motion/tokens'
import { coverTitle } from '@/lib/editorial/cover-title'
import { stillCover, useRotatingPhoto } from '@/components/rotating-photo'

/** 카드가 그리는 것. 홈의 행과 상세의 '비슷한 작품' 이 같은 모양이어야 한다. */
export type CardCharacter = {
  /** 11/12 크리에이터 이름(lib/creator-name) — 해시태그 아래. */
  creator?: string
  startingContext?: string | null
  occupation?: string | null
  contactEnabled?: boolean | null
  id: string
  slug: string | null
  name: string
  tagline: string | null
  /** 상세 소개 글 앞부분(카드 2줄). */
  blurb?: string | null
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
  /** 언베일 썸네일(11/4). */
  coverUnveil?: boolean
  veiled?: boolean
  /** 11/12 이 작품에서 오간 대화 수 — 표지 왼쪽 아래에 미로 마크와 함께. 없거나 0이면 안 그린다. */
  chats?: number
}

/**
 * 캐릭터 카드 하나.
 * 이미지 아래에 이름·한 줄·해시태그를 둔다(10/19). 대화 인원은 띄우지 않는다.
 * 마크업을 한 곳에 두어야 홈과 상세가 어긋나지 않는다 (실제로 어긋났었다).
 */
/** 11/7: 카드 소개 2줄 = 상세 화면 소개 글의 앞부분([프로필] 같은 머리말은 뺀다). 없으면 한 줄 대사. */
const cardBlurb = (c: CardCharacter) => c.blurb?.replace(/\[[^\]\n]*\]/g, ' ').replace(/[*_#]/g, '').replace(/\s+/g, ' ').trim() || (c.tagline ? `“${c.tagline}”` : '')

export function CharacterCard({ c, still }: { c: CardCharacter; tagsBelow?: boolean; /** 11/10: 표지에 고정(홈 '미로 오리지널' 줄) */ still?: boolean }) {
  const reduce = useReducedMotion()
  const slug = c.slug ?? c.id
  const tags = characterTags(c)
  const language = useLanguage()
  const { photo, photos, active, onPhotoReady } = useRotatingPhoto(c.images, c.veiled, still || stillCover(c.slug))
  return (
    <motion.div whileTap={reduce ? undefined : { scale: press.scale }} transition={spring.quick}>
      <TransitionLink href={c.href ?? `/character/${slug}`}
        aria-label={`${c.name}${c.caption ? `, ${c.caption}` : ''}`}
        style={{ display: 'block', minWidth: 0 }}>
        {/* 11/4: 사진 원본 비율(4:5)대로 — 15:16 이면 아래 제목 로고가 잘렸다. */}
        <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <CharacterVisual name={c.name} accent={c.accentA} slug={slug} photo={photo} photos={photos} active={active} onPhotoReady={onPhotoReady} ratio="4 / 5" scrim={false} />
          {/* 11/10 사용자: 흐림은 수위 있는 표지가 보일 때만 — 넘어간 다른 사진엔 안 씌운다 */}
          {c.coverUnveil && photo === c.images[0] && <UnveilCover veiled={c.veiled} label="언베일" hideLabel={!c.veiled} />}
          {!!c.chats && <span style={{ position: 'absolute', left: 6, bottom: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 7px', borderRadius: 999, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, fontWeight: 600, lineHeight: 1 }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, flex: 'none', background: 'var(--color-lavender-400)', WebkitMask: 'url(/logo-mark.svg) center / contain no-repeat', mask: 'url(/logo-mark.svg) center / contain no-repeat' }} />{/* 숫자가 마크보다 떠 보여 살짝 내린다 */}<span style={{ position: 'relative', top: '.08em' }}>{new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(c.chats)}</span>
          </span>}
        </div>
        {/* 10/19: 사진 아래 — 굵은 이름, 회색 한 줄 소개 2줄, 둥근 칩 태그(레퍼런스 카드). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 0 0', color: 'var(--color-text-primary)' }}>
          <p className="t-body t-name" style={{ fontWeight: 'var(--weight-bold)', fontSize: 14, lineHeight: 1.25, letterSpacing: '-.025em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{coverTitle(c)}</p>
          {/* 소개는 늘 2줄 높이(내용이 없어도). */}
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, height: '2.8em', color: 'var(--color-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{cardBlurb(c)}</p>
          {/* 11/6: 상세 페이지 해시태그 칩(회색 바탕·강조색 글자)을 작게 — 한 줄로 이어지고 옆으로 밀어서 넘겨 본다. */}
          <div className="tag-scroll" style={{ display: 'flex', flexWrap: 'nowrap', gap: 4 }}>
            {tags.map(tag => (
              <span key={tag} style={{ padding: '2px 6px', borderRadius: 6, background: 'var(--color-surface-2)', color: 'var(--color-accent-text)', fontSize: 10, fontWeight: 400, lineHeight: 1.4, whiteSpace: 'nowrap' }}>#{tag}</span>
            ))}
          </div>
          {c.creator && <p style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: 'var(--color-text-tertiary, #8f8f99)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{c.creator}</p>}
        </div>
      </TransitionLink>
    </motion.div>
  )
}
