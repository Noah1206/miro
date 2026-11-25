'use client'
import { useState } from 'react'
import type { HomeCard } from '@/lib/home'
import { useLanguage, useT } from '@/lib/i18n/client'
import { TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { UnveilCover } from '@/components/unveil-badge'
import { cardBlurb } from '@/components/character-card'
import { characterTags } from '@/lib/character-card-copy'
import { coverTitle } from '@/lib/editorial/cover-title'
import { AfterMount } from '@/components/after-mount'
import styles from './hot-ranking.module.css'

export type HotTab = 'new' | 'live' | 'day' | 'month' | 'all'
const TABS: Array<[HotTab, string]> = [['new', '신작 실시간'], ['live', '실시간'], ['day', '일간'], ['month', '월간'], ['all', '전체']]

/** 11/25 사용자: 배너 아래 '지금 가장 핫한' — 기간 탭 + 세 개씩 세로로 묶은 순위 열을 옆으로 밀어 넘긴다. */
export function HotRanking({ lists }: { lists: Record<HotTab, HomeCard[]> }) {
  const t = useT()
  const fmt = new Intl.NumberFormat(useLanguage(), { notation: 'compact', maximumFractionDigits: 1 })
  const [tab, setTab] = useState<HotTab>('new')
  const items = lists[tab]
  const columns = Array.from({ length: Math.ceil(items.length / 3) }, (_, i) => items.slice(i * 3, i * 3 + 3))
  if (!TABS.some(([k]) => lists[k].length)) return null
  return <section aria-labelledby="hot-title" className={styles.section}>
    <h2 id="hot-title" className={styles.title}>{t('지금 가장 핫한')}</h2>
    <div role="tablist" className={styles.tabs}>
      {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(label)}</button>)}
    </div>
    <div key={tab} className={styles.pager}>
      {columns.map((col, ci) => <ol key={ci} className={styles.column} start={ci * 3 + 1}>
        {col.map((c, i) => { const tags = characterTags(c); return <li key={c.id}>
          <TransitionLink href={`/character/${c.slug ?? c.id}`} className={styles.item}>
            <div className={styles.cover}>
              <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug ?? c.id} photo={c.images[0]} ratio="3 / 4" scrim={false} />
              {c.coverUnveil && <UnveilCover veiled={c.veiled} label="언베일" hideLabel bleed />}
              <span className={styles.rank}>{ci * 3 + i + 1}</span>
            </div>
            <div className={styles.text}>
              <p className={styles.name}>{coverTitle(c)}</p>
              {c.creator && <p className={styles.creator}>{c.creator}</p>}
              <p className={styles.blurb}>{cardBlurb(c)}</p>
              <p className={styles.tags}><AfterMount>{tags.slice(0, 3).map(tag => `#${tag}`).join(' ')}</AfterMount></p>
              <p className={styles.stats}>{t('{count}명', { count: fmt.format(c.plays) })}{!!c.chats && ` · ${t('대화 {count}', { count: fmt.format(c.chats) })}`}</p>
            </div>
          </TransitionLink>
        </li> })}
      </ol>)}
      {items.length === 0 && <p className={styles.empty}>{t('아직 집계된 작품이 없어요')}</p>}
    </div>
  </section>
}
