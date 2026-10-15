import { getT } from '@/lib/i18n/server'
import { Page, PageHeader } from '@/components/ui'
import { listStories } from '@/lib/stories/repo'
import { StoryCard } from './story-card'
import { HomeContentTabs } from '../home/content-tabs'

export const dynamic = 'force-dynamic'

/** 오리지널 스토리 목록 — 여러 인물·사건·결말이 있는 미로 오리지널 작품. */
export default async function Stories() {
  const t = await getT()
  const list = await listStories()
  return (
    <Page wide style={{ paddingBottom: 'calc(var(--nav-h) + var(--space-5))' }}>
      <PageHeader back="/home" title={t('미로 오리지널')} lead={t('사건을 따라가고, 함께할 사람과 관계의 이름을 직접 정하는 이야기.')} />
      <HomeContentTabs active="stories" />
      {list.length === 0
        ? <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('아직 공개된 작품이 없어요.')}</p>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
            {list.map(s => <StoryCard key={s.slug} s={s} />)}
          </div>}
    </Page>
  )
}
