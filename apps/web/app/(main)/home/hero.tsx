'use client'
import { useEffect, useState } from 'react'
import { TransitionLink } from '@/components/ui'
import { characterStorySummary, characterTags } from '@/lib/character-card-copy'
import { useT } from '@/lib/i18n/client'
import type { HomeCard } from '@/lib/home'
import styles from './hero.module.css'

/**
 * 11/10 사용자: 배너 자리에 크랙식 추천 — 랜덤으로 고른 작품을 큰 그림 + 소개 카드 + 다음 작품 띠로.
 * 5초마다 다음으로, 화살표·띠를 누르면 바로 넘어간다. 작은 화면에선 큰 그림 위에 글만.
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
  const c = items[i % n]!
  const href = `/character/${c.slug ?? c.id}`
  const blurb = characterStorySummary(c)
  const next = Array.from({ length: Math.min(4, n - 1) }, (_, k) => (i + k + 1) % n)
  return (
    <section className={styles.hero} aria-label={t('추천 작품')}>
      <TransitionLink href={href} className={styles.main} aria-label={c.name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={c.id} src={c.images[0]} alt="" className={styles.art} fetchPriority="high" />
        <div className={styles.mobileCopy}>
          <span className={styles.badge}>{t('스토리 추천')}</span>
          <strong className={styles.title}>{c.name}</strong>
          {blurb && <p className={styles.blurb}>{blurb}</p>}
        </div>
      </TransitionLink>
      <div className={styles.card}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className={styles.cardClip}><img src={c.images[0]} alt="" aria-hidden className={styles.cardBg} /></span>
        <div className={styles.cardBody}>
          <span className={styles.badge}>{t('스토리 추천')}</span>
          <strong className={styles.title}>{c.name}</strong>
          {blurb && <p className={styles.blurb}>{blurb}</p>}
          <p className={styles.tags}>{characterTags(c).slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</p>
          <div className={styles.foot}>
            <TransitionLink href={href} className={styles.more}>{t('자세히 보기')}</TransitionLink>
            <span className={styles.count}>{i + 1} / {n}</span>
          </div>
        </div>
        {n > 1 && <button type="button" className={styles.arrow} aria-label={t('다음')} onClick={() => setI((i + 1) % n)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>}
      </div>
      <div className={styles.strips}>
        {next.map(k => (
          <button key={items[k]!.id} type="button" className={styles.strip} aria-label={items[k]!.name} onClick={() => setI(k)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={items[k]!.images[0]} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {n > 1 && <div className={styles.dots}>{items.map((x, k) => <i key={x.id} className={k === i ? styles.on : ''} />)}</div>}
    </section>
  )
}
