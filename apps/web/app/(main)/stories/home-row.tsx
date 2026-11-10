import { getT } from '@/lib/i18n/server'
import { TransitionLink } from '@/components/ui'
import { listStories } from '@/lib/stories/repo'
import { StoryCard } from './story-card'

/** 홈의 '미로 오리지널' 줄. 공개 작품이 없으면(운영 기본) 아무것도 그리지 않는다. */
export async function OriginalStoriesRow() {
  const t = await getT()
  const list = await listStories().catch(() => [])
  if (!list.length) return null
  return (
    <section aria-label={t('미로 오리지널')} style={{ padding: '0 var(--gutter)', marginBottom: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="t-title-3"><span aria-hidden="true">✨ </span>{t('미로 오리지널')}</h2>
          <p className="t-caption" style={{ margin: '4px 0 0', color: 'var(--color-text-tertiary)' }}>{t('미로가 직접 쓴 이야기 속으로')}</p>
        </div>
        <TransitionLink href="/stories" className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('전체 보기')}</TransitionLink>
      </div>
      {/* 카드 크기는 홈의 다른 섹션 줄(.row-scroll--flush, 폭 150px)과 같게(10/19). */}
      <div className="row-scroll row-scroll--flush row-scroll--stories" style={{ margin: '0 calc(-1 * var(--gutter))' }}>
        {list.map(s => <StoryCard key={s.slug} s={s} compact />)}
      </div>
    </section>
  )
}
