'use client'
import { useEffect, useState } from 'react'
import { TransitionLink } from '@/components/ui'
import { characterStorySummary, characterTags } from '@/lib/character-card-copy'
import { useT } from '@/lib/i18n/client'
import type { HomeCard } from '@/lib/home'
import styles from './hero.module.css'
import { AfterMount } from '@/components/after-mount'

/**
 * 11/21 사용자(레퍼런스 캐러셀): 가운데 큰 카드 하나 + 양옆에 이전·다음 카드가 걸쳐 보인다. 가운데 카드는 그림 위에
 * 아래쪽 그라데이션 → 칩(공식 크리에이터·만든 사람) · 제목 · 한 줄 소개 · 해시태그, 오른쪽 아래 '지금/전체'.
 * 5초마다 다음으로, 양옆 화살표·옆 카드를 누르면 바로 넘어간다. 작은 화면은 가운데 카드만.
 */
export function HomeHero({ items }: { items: HomeCard[] }) {
  const t = useT()
  const [i, setI] = useState(0)
  const n = items.length
  useEffect(() => {
    if (n < 2) return
    const id = setInterval(() => setI(v => (v + 1) % n), 5000)
    return () => clearInterval(id)
  }, [n, i])
  if (!n) return null
  const at = (k: number) => items[((k % n) + n) % n]!
  const c = at(i)
  const prev = at(i - 1), next = at(i + 1)
  const href = `/character/${c.slug ?? c.id}`
  const blurb = characterStorySummary(c)
  const go = (d: number) => setI(v => ((v + d) % n + n) % n)
  return (
    <section className={styles.hero} aria-label={t('추천 작품')}>
      {n > 1 && <button type="button" className={styles.side} aria-label={prev.name} onClick={() => go(-1)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={prev.images[0]} alt="" loading="lazy" />
      </button>}
      <TransitionLink href={href} className={styles.main} aria-label={c.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={c.id} src={c.images[0]} alt="" className={styles.art} fetchPriority="high" />
        <div className={styles.copy}>
          <div className={styles.chips}>
            {/* 운영 작품은 is_official 이 꺼진 채 slug 만 official-* 인 것도 있다. */}
            {(c.isOfficial || c.slug?.startsWith('official-')) && <span className={styles.chipOfficial}>{t('공식 크리에이터')}</span>}
            {c.creator && <span className={styles.chipCreator}>{c.creator}</span>}
          </div>
          <strong className={styles.title}>{c.name}</strong>
          {blurb && <p className={styles.blurb}>{blurb}</p>}
          <p className={styles.tags}><AfterMount>{characterTags(c).slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</AfterMount></p>
        </div>
        {n > 1 && <span className={styles.count}><b>{i + 1}</b>/{n}</span>}
      </TransitionLink>
      {n > 1 && <button type="button" className={styles.side} aria-label={next.name} onClick={() => go(1)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={next.images[0]} alt="" loading="lazy" />
      </button>}
      {n > 1 && <>
        <button type="button" className={`${styles.arrow} ${styles.arrowPrev}`} aria-label={t('이전')} onClick={() => go(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <button type="button" className={`${styles.arrow} ${styles.arrowNext}`} aria-label={t('다음')} onClick={() => go(1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </>}
    </section>
  )
}
