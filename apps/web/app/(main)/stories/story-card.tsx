import { CharacterVisual } from '@/components/character-visual'
import { Chip, TransitionLink } from '@/components/ui'
import type { StoryCard as Card } from '@/lib/stories/repo'

/** 역하렘·BL 과 주인공 성별은 들어가기 전에 보이게 — 카드·상세 공통 표시. */
export const audienceLabel = (a: Card['audience']) => (a === 'reverse_harem' ? '역하렘 · 여성 주인공' : 'BL · 남성 주인공')

/** 표지 이미지는 아직 없다 — 기존 글자 자리표시(CharacterVisual)로 임시 상태임을 그대로 보인다. */
export function StoryCard({ s, compact }: { s: Card; compact?: boolean }) {
  return (
    <TransitionLink href={`/stories/${s.slug}`} aria-label={`${s.title}, ${audienceLabel(s.audience)}`} style={{ display: 'block', color: 'inherit' }}>
      <div style={{ position: 'relative' }}>
        <CharacterVisual name={s.title} accent={null} slug={s.slug} photo={null} ratio="2 / 3" shared={false} scrim={false} />
        <span className="t-micro" style={{ position: 'absolute', left: 8, top: 8, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.72)', color: 'var(--color-text-primary)' }}>
          {compact ? (s.audience === 'reverse_harem' ? '역하렘' : 'BL') : audienceLabel(s.audience)}
        </span>
        {!s.published && <span className="t-micro" style={{ position: 'absolute', left: 8, bottom: 8, padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--color-bg-rgb),0.72)', color: 'var(--color-text-secondary)' }}>미공개</span>}
      </div>
      <p className="t-body" style={{ marginTop: 8, fontWeight: 'var(--weight-semibold)', lineHeight: 1.35 }}>{s.title}</p>
      {!compact && <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.tagline}</p>}
      {!compact && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>{s.genres.slice(0, 3).map(g => <Chip key={g}>#{g.replace(/\s+/g, '')}</Chip>)}</div>}
    </TransitionLink>
  )
}
