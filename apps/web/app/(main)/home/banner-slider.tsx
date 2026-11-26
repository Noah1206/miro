'use client'
import { useEffect, useRef } from 'react'
import type { HomeCard } from '@/lib/home'
import { TransitionLink } from '@/components/ui'
import { characterImageSources } from '@/components/character-visual'
import { cardBlurb } from '@/components/character-card'
import { coverTitle } from '@/lib/editorial/cover-title'
import styles from './banner-slider.module.css'

/**
 * 11/27 사용자: 홈 배너가 3초마다 옆으로 자동으로 넘어간다 — 첫 장은 이벤트 배너, 그 뒤는 인기 작품.
 * 가운데 배너 양옆으로 이전·다음 배너가 어둡게 걸쳐 보인다(레퍼런스). 끝없이 돌도록 앞뒤에 복제 한 장씩 두고, 복제에 닿으면 소리 없이 진짜 자리로 옮긴다.
 * 가로 스크롤 스냅이라 손으로도 넘길 수 있고, 만지는 동안과 화면 밖에서는 멈춘다.
 */
export type EventBanner = { href: string; src: string; label: string }
export function BannerSlider({ works, events }: { works: HomeCard[]; events: EventBanner[] }) {
  const track = useRef<HTMLDivElement>(null)
  const n = works.length + events.length
  useEffect(() => {
    const el = track.current
    if (!el || n < 2) return
    const slides = Array.from(el.children) as HTMLElement[]   // [복제(마지막), 진짜 n장, 복제(첫 장)]
    const left = (i: number) => slides[i]!.offsetLeft - (el.clientWidth - slides[i]!.offsetWidth) / 2
    const nearest = () => slides.reduce((best, s, i) => Math.abs(left(i) - el.scrollLeft) < Math.abs(left(best) - el.scrollLeft) ? i : best, 0)
    const mark = (i: number) => slides.forEach((s, k) => s.toggleAttribute('data-active', k === i))
    const jump = (i: number) => { el.style.scrollBehavior = 'auto'; el.scrollLeft = left(i); el.style.scrollBehavior = ''; mark(i) }
    jump(1)
    let held = false, settle: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      mark(nearest())
      clearTimeout(settle)
      settle = setTimeout(() => { const i = nearest(); if (i === 0) jump(n); else if (i === n + 1) jump(1) }, 140)
    }
    const hold = () => { held = true }, release = () => { held = false }
    el.addEventListener('scroll', onScroll, { passive: true }); el.addEventListener('pointerdown', hold); addEventListener('pointerup', release); addEventListener('pointercancel', release)
    const auto = matchMedia('(prefers-reduced-motion: reduce)').matches ? undefined
      : setInterval(() => { if (!held && !document.hidden) el.scrollTo({ left: left(nearest() + 1), behavior: 'smooth' }) }, 3000)
    return () => { clearInterval(auto); clearTimeout(settle); el.removeEventListener('scroll', onScroll); el.removeEventListener('pointerdown', hold); removeEventListener('pointerup', release); removeEventListener('pointercancel', release) }
  }, [n])
  const event = (e: EventBanner, key: string, clone = false) => (
    <TransitionLink key={key} href={e.href} aria-label={e.label} aria-hidden={clone || undefined} tabIndex={clone ? -1 : undefined} className={styles.slide}>
      <img src={e.src} alt="" width={1800} height={510} className={styles.eventImage} />
    </TransitionLink>
  )
  // 11/27 사용자: 작품 배너도 이벤트 배너처럼 한 장의 그림으로 — 표지를 흐리게 깐 배경 + 오른쪽에 표지가 번지듯 이어지고 그 위에 제목.
  const work = (c: HomeCard, key: string, clone = false) => {
    const art = c.images[0] ? characterImageSources(c.images[0], 'detail') : null
    const thumb = c.images[0] ? characterImageSources(c.images[0], 'thumbnail').src : null
    return (
      <TransitionLink key={key} href={`/character/${c.slug ?? c.id}`} aria-hidden={clone || undefined} tabIndex={clone ? -1 : undefined} className={`${styles.slide} ${styles.work}`}>
        {thumb && <span aria-hidden className={styles.backdrop} style={{ backgroundImage: `url(${JSON.stringify(thumb)})` }} />}
        <span aria-hidden className={styles.shade} />
        {art && <img {...art} sizes="(max-width: 1023px) 50vw, 600px" alt="" className={styles.art} loading="lazy" decoding="async" />}
        <div className={styles.copy}>
          <p className={styles.title}>{coverTitle(c)}</p>
          <p className={styles.blurb}>{cardBlurb(c)}</p>
        </div>
      </TransitionLink>
    )
  }
  const lastWork = works.at(-1), lastEvent = events.at(-1), first = events[0]
  return (
    <div ref={track} className={styles.track}>
      {n > 1 && (lastWork ? work(lastWork, 'clone-last', true) : lastEvent && event(lastEvent, 'clone-last', true))}
      {events.map(e => event(e, e.src))}
      {works.map(c => work(c, c.id))}
      {n > 1 && (first ? event(first, 'clone-first', true) : works[0] && work(works[0], 'clone-first', true))}
    </div>
  )
}
