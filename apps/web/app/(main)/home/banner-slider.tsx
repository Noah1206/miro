'use client'
import { useEffect, useRef } from 'react'
import type { HomeCard } from '@/lib/home'
import { TransitionLink } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { cardBlurb } from '@/components/character-card'
import { coverTitle } from '@/lib/editorial/cover-title'
import styles from './banner-slider.module.css'

/**
 * 11/27 사용자: 홈 배너가 3초마다 옆으로 자동으로 넘어간다 — 첫 장은 이벤트 배너, 그 뒤는 인기 작품.
 * 가로 스크롤 스냅이라 손으로도 넘길 수 있고, 만지는 동안과 화면 밖에서는 멈춘다. 끝에서는 처음으로 돌아간다.
 */
export function BannerSlider({ works, eventLabel }: { works: HomeCard[]; eventLabel: string }) {
  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = track.current
    if (!el || el.children.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let held = false
    const hold = () => { held = true }, release = () => { held = false }
    el.addEventListener('pointerdown', hold); addEventListener('pointerup', release); addEventListener('pointercancel', release)
    const id = setInterval(() => {
      if (held || document.hidden) return
      const step = (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
      el.scrollTo({ left: end ? 0 : el.scrollLeft + step, behavior: 'smooth' })
    }, 3000)
    return () => { clearInterval(id); el.removeEventListener('pointerdown', hold); removeEventListener('pointerup', release); removeEventListener('pointercancel', release) }
  }, [works.length])
  return (
    <div ref={track} className={styles.track}>
      <TransitionLink href="/create" aria-label={eventLabel} className={styles.slide}>
        <img src="/events/creator-argon.webp" alt="" width={1800} height={510} className={styles.eventImage} />
      </TransitionLink>
      {works.map(c => (
        <TransitionLink key={c.id} href={`/character/${c.slug ?? c.id}`} className={`${styles.slide} ${styles.work}`}>
          <div className={styles.copy}>
            <p className={styles.title}>{coverTitle(c)}</p>
            <p className={styles.blurb}>{cardBlurb(c)}</p>
          </div>
          <div className={styles.cover}><CharacterVisual name={c.name} accent={c.accentA} slug={c.slug ?? c.id} photo={c.images[0]} ratio="1 / 1" scrim={false} /></div>
        </TransitionLink>
      ))}
    </div>
  )
}
