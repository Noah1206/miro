'use client'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { CharacterVisual } from '@/components/character-visual'

export function PhotoHero({ name, accent, slug, photos, shared = true }: {
  name: string; accent: string | null; slug: string; photos: string[]; shared?: boolean
}) {
  const [selected, setSelected] = useState(0)
  const photo = photos[selected] ?? null
  return (
    <div style={{ position: 'relative' }}>
      <CharacterVisual name={name} accent={accent} slug={slug} photo={photo} ratio="4 / 5" shared={shared} style={{ borderRadius: 0, border: 0 }} />
      {photos.length > 1 && (
        <div role="group" aria-label={`${name} 사진 선택`} style={{
          position: 'absolute', left: 'var(--gutter)', right: 'var(--gutter)', bottom: 'var(--space-7)', zIndex: 3,
          display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0', scrollbarWidth: 'none',
        }}>
          {photos.map((src, index) => (
            <button key={`${src}-${index}`} type="button" onClick={() => setSelected(index)} aria-label={`${index + 1}번째 사진 보기`} aria-pressed={selected === index} style={{
              width: 52, height: 66, flex: '0 0 auto', padding: 0, overflow: 'hidden', cursor: 'pointer',
              borderRadius: 8, border: selected === index ? '1.5px solid var(--color-white)' : '1px solid rgba(255,255,255,.18)',
              background: 'var(--color-surface-2)', opacity: selected === index ? 1 : 0.68,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" width={52} height={66} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Scroll-linked: 스크롤 위치가 곧 progress. 위로 밀면 비주얼이 조금 커지며 가라앉는다 (transform·opacity 만). */
export function DetailHero({ name, accent, slug, images }: { name: string; accent: string | null; slug: string; images: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08])
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.35])
  const y = useTransform(scrollYProgress, [0, 1], [0, 40])
  const reduce = useReducedMotion()
  return (
    <div ref={ref} style={{ position: 'relative', overflow: 'hidden', borderRadius: 0 }}>
      <motion.div style={reduce ? undefined : { scale, opacity, y, transformOrigin: 'center top' }}>
        <PhotoHero name={name} accent={accent} slug={slug} photos={images.filter(Boolean)} />
      </motion.div>
    </div>
  )
}
