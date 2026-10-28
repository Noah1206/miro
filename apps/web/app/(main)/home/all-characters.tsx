'use client'
import { useState } from 'react'
import type { HomeCard } from '@/lib/home'
import { useT } from '@/lib/i18n/client'
import { StoryCard } from './feed'
import styles from './home.module.css'

/** 홈 '전체 캐릭터' 격자 — 대화량순(대화한 사람 수)/최신순(10/28). items 는 최신순으로 온다. */
export function AllCharacters({ items }: { items: HomeCard[] }) {
  const t = useT()
  const [sort, setSort] = useState<'plays' | 'latest'>('plays')
  const shown = sort === 'latest' ? items : [...items].sort((a, b) => b.plays - a.plays)
  return (
    <section aria-labelledby="home-all">
      <h2 id="home-all" className="t-title-3" style={{ padding: '0 var(--gutter)', marginBottom: 12 }}>{t('🗂️ 전체 캐릭터')}</h2>
      {/* 10/28: 둥근 바 안에서 고른 쪽만 어두운 알약(사용자 스크린샷). */}
      <div role="group" aria-label={t('정렬')} style={{ display: 'flex', gap: 4, padding: 6, margin: '0 var(--gutter) 16px', borderRadius: 14, background: 'var(--color-surface-2)' }}>
        {([['plays', t('대화량순')], ['latest', t('최신순')]] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)}
            style={{ flex: 1, minHeight: 44, border: 0, borderRadius: 10, cursor: 'pointer', fontSize: 'var(--font-body-size)',
              background: sort === key ? 'var(--color-bg)' : 'transparent', color: sort === key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{label}</button>
        ))}
      </div>
      <div className={styles.grid}>{shown.map(c => <StoryCard key={c.id} c={c} />)}</div>
    </section>
  )
}
