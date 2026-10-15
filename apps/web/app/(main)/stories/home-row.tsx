import { TransitionLink } from '@/components/ui'
import { listStories } from '@/lib/stories/repo'
import { StoryCard } from './story-card'

/** 홈의 '미로 오리지널' 줄. 공개 작품이 없으면(운영 기본) 아무것도 그리지 않는다. */
export async function OriginalStoriesRow() {
  const list = await listStories().catch(() => [])
  if (!list.length) return null
  return (
    <section aria-label="미로 오리지널" style={{ padding: '0 var(--gutter)', marginBottom: 'var(--space-5)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h2 className="t-title-3">미로 오리지널</h2>
        <TransitionLink href="/stories" className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>전체 보기</TransitionLink>
      </div>
      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'clamp(132px, 38vw, 176px)', gap: 'var(--space-3)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {list.map(s => <StoryCard key={s.slug} s={s} compact />)}
      </div>
    </section>
  )
}
