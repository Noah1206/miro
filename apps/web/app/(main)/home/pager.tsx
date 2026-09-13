'use client'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { spring } from '@/lib/motion/tokens'
import { TransitionLink } from '@/components/ui'
import { CharacterVisual, portraitFor } from '@/components/character-visual'
import type { OfficialCard } from '@/lib/characters'

/**
 * 다른 세계들. 스냅·관성·러버밴드는 브라우저(scroll-snap)에 맡기고,
 * Motion 은 인디케이터 하나가 이동하는 것만 그린다 (shared layout).
 */
export function WorldPager({ items }: { items: OfficialCard[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  useEffect(() => {
    const root = ref.current; if (!root) return
    const obs = new IntersectionObserver((entries) => {
      const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (best) setActive(Number((best.target as HTMLElement).dataset.index))
    }, { root, threshold: [0.5, 0.75] })
    root.querySelectorAll('[data-index]').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return (
    <section aria-label="다른 세계">
      <div ref={ref} className="pager">
        {items.map((c, i) => (
          <TransitionLink key={c.id} href={`/character/${c.slug}`} data-index={i} style={{ display: 'block' }}>
            <CharacterVisual name={c.name} accent={c.accentA} slug={c.slug} photo={portraitFor(c.slug)} ratio="3 / 4" />
            <div style={{ padding: '12px 2px 0' }}>
              <p className="t-title-3 t-name">{c.name}</p>
              <p className="t-caption">{c.role}</p>
            </div>
          </TransitionLink>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{active + 1} / {items.length}</p>
      <div aria-hidden style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14 }}>
        {items.map((_, i) => (
          <span key={i} style={{ position: 'relative', width: 6, height: 6, borderRadius: 3, background: 'var(--color-border-strong)' }}>
            {i === active && <motion.span layoutId="pager-dot" transition={spring.default} style={{ position: 'absolute', inset: -1, borderRadius: 4, background: 'var(--color-white)' }} />}
          </span>
        ))}
      </div>
    </section>
  )
}
