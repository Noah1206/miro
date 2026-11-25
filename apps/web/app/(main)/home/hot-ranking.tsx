'use client'
import { useRef, useState } from 'react'
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

export type HotTab = 'new' | 'all'
const TABS: Array<[HotTab, string]> = [['new', '신작'], ['all', '전체']]

/** 11/25~26 사용자: 배너 아래 '지금 가장 핫한' — 신작·전체 탭, 세 개씩 세로로 묶은 순위 열을 옆으로 넘긴다(화살표·밀기). */
export function HotRanking({ lists }: { lists: Record<HotTab, HomeCard[]> }) {
  const t = useT()
  const fmt = new Intl.NumberFormat(useLanguage(), { notation: 'compact', maximumFractionDigits: 1 })
  const [tab, setTab] = useState<HotTab>(lists.new.length ? 'new' : 'all')
  const pager = useRef<HTMLDivElement>(null)
  const items = lists[tab]
  const columns = Array.from({ length: Math.ceil(items.length / 3) }, (_, i) => items.slice(i * 3, i * 3 + 3))
  const step = (dir: 1 | -1) => { const el = pager.current; const col = el?.firstElementChild as HTMLElement | null; if (el && col) el.scrollBy({ left: dir * (col.offsetWidth + 14), behavior: 'smooth' }) }
  if (!lists.new.length && !lists.all.length) return null
  return <section aria-labelledby="hot-title" className={styles.section}>
    <h2 id="hot-title" className={styles.title}>{t('지금 가장 핫한')}</h2>
    <div role="tablist" className={styles.tabs}>
      {TABS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t(label)}</button>)}
    </div>
    <div className={styles.wrap}>
      <div key={tab} ref={pager} className={styles.pager}>
        {columns.map((col, ci) => <ol key={ci} className={styles.column} start={ci * 3 + 1}>
          {col.map((c, i) => { const tags = characterTags(c); return <li key={c.id}>
            <TransitionLink href={`/character/${c.slug ?? c.id}`} className={styles.item}>
              <div className={styles.cover}>
                <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug ?? c.id} photo={c.images[0]} ratio="2 / 3" scrim={false} />
                {c.coverUnveil && <UnveilCover veiled={c.veiled} label="언베일" hideLabel bleed />}
                <span className={styles.rank}>{ci * 3 + i + 1}</span>
              </div>
              <div className={styles.text}>
                <p className={styles.name}>{coverTitle(c)}</p>
                {c.creator && <p className={styles.creator}>{c.creator}</p>}
                <p className={styles.blurb}>{cardBlurb(c)}</p>
                <p className={styles.tags}><AfterMount>{tags.slice(0, 3).map(tag => `#${tag}`).join(' ')}</AfterMount></p>
                <p className={styles.stats}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M1 20c0-4 3.6-6 8-6s8 2 8 6z" /><circle cx="17" cy="9" r="3" opacity=".7" /><path d="M17 14c3.5 0 6 1.6 6 5h-4.5c0-2-.6-3.6-1.5-5z" opacity=".7" /></svg>
                  <span>{fmt.format(c.plays)}</span>
                  {!!c.chats && <><i aria-hidden="true">·</i><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.5 3.4 6L4.5 21l4.3-2.3c1 .2 2.1.3 3.2.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z" /></svg><span>{fmt.format(c.chats)}</span></>}
                </p>
              </div>
            </TransitionLink>
          </li> })}
        </ol>)}
        {items.length === 0 && <p className={styles.empty}>{t('아직 집계된 작품이 없어요')}</p>}
      </div>
      {columns.length > 1 && <>
        <button type="button" aria-label={t('이전')} className={`${styles.arrow} ${styles.prev}`} onClick={() => step(-1)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m15 6-6 6 6 6" /></svg></button>
        <button type="button" aria-label={t('다음')} className={`${styles.arrow} ${styles.next}`} onClick={() => step(1)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg></button>
      </>}
    </div>
  </section>
}
