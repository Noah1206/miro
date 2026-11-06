'use client'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { CharacterVisual, characterImageSources } from '@/components/character-visual'
import { useT } from '@/lib/i18n/client'
import { UnveilCover } from '@/components/unveil-badge'
import { isUnveilPhoto } from '@/lib/unveil-photo'

type Veil = { signedIn: boolean; returnTo: string } | null

export function PhotoHero({ name, accent, slug, photos, shared = true, veil = null }: {
  name: string; accent: string | null; slug: string; photos: string[]; shared?: boolean
  /** 11/4: 언베일을 안 켠 사람 — 언베일 사진(unveil-…)만 흐리고, 누르면 성인 본인인증 → 언베일 켜기. */
  veil?: Veil
}) {
  const t = useT()
  const [selected, setSelected] = useState(0)
  const photo = photos[selected] ?? null
  // 11/5: 넘길 때마다 큰 사진을 그제야 받아 어두운 배경이 비쳤다 — 나머지 사진도 같은 크기·srcset 으로 미리 받아 캐시에 둔다.
  useEffect(() => {
    for (const src of photos.slice(1)) {
      const s = characterImageSources(src, 'detail'), img = new Image()
      if ('srcSet' in s && s.srcSet) { img.sizes = '(max-width: 768px) 100vw, 720px'; img.srcset = s.srcSet }
      img.src = s.src
    }
  }, [photos])
  // 11/6: 대표 사진은 저절로 다음 장으로(11/7 사용자: 3.5초 → 1초, 누르면 그 자리에서 다시 센다). 움직임 줄이기 설정이면 넘기지 않는다.
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce || photos.length < 2) return
    const id = setInterval(() => setSelected(i => (i + 1) % photos.length), 1000)
    return () => clearInterval(id)
  }, [reduce, photos.length, selected])
  return (
    <div style={{ position: 'relative' }}>
      <CharacterVisual name={name} accent={accent} slug={slug} photo={photo} ratio="4 / 5" size="detail" loading="eager" shared={shared} style={{ borderRadius: 0, border: 0 }} />
      {veil && isUnveilPhoto(photo) && <UnveilCover veiled label={t('언베일')} unlock={veil} />}
      {/* 11/5: 썸네일 줄 대신 < > 로 넘긴다(끝에서 처음으로 돌아감). */}
      {photos.length > 1 && (
        <div role="group" aria-label={t('{name} 사진 선택', { name })}>
          {([-1, 1] as const).map(step => (
            <button key={step} type="button" onClick={() => setSelected(i => (i + step + photos.length) % photos.length)}
              aria-label={t(step < 0 ? '이전 사진' : '다음 사진')} style={{
                position: 'absolute', top: '50%', [step < 0 ? 'left' : 'right']: 'var(--gutter)', transform: 'translateY(-50%)', zIndex: 3,
                width: 40, height: 40, borderRadius: '50%', border: 0, padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.38)', color: 'var(--color-white)', backdropFilter: 'blur(4px)',
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={step < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
              </svg>
            </button>
          ))}
          <span aria-live="polite" style={{
            position: 'absolute', right: 'var(--gutter)', bottom: 'var(--space-7)', zIndex: 3, padding: '3px 10px', borderRadius: 999,
            background: 'rgba(0,0,0,0.38)', color: 'var(--color-white)', fontSize: 'var(--font-caption)',
          }}>{selected + 1} / {photos.length}</span>
        </div>
      )}
    </div>
  )
}

/** Scroll-linked: 스크롤 위치가 곧 progress. 위로 밀면 비주얼이 조금 커지며 가라앉는다 (transform·opacity 만). */
export function DetailHero({ name, accent, slug, images, veil = null }: { name: string; accent: string | null; slug: string; images: string[]; veil?: Veil }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.08])
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.35])
  const y = useTransform(scrollYProgress, [0, 1], [0, 40])
  const reduce = useReducedMotion()
  return (
    <div ref={ref} style={{ position: 'relative', overflow: 'hidden', borderRadius: 0 }}>
      <motion.div style={reduce ? undefined : { scale, opacity, y, transformOrigin: 'center top' }}>
        <PhotoHero name={name} accent={accent} slug={slug} photos={images.filter(Boolean)} veil={veil} />
      </motion.div>
    </div>
  )
}
