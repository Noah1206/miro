'use client'

import { useState } from 'react'

type ImageSize = 'avatar' | 'thumbnail' | 'detail'

const IMAGE_WIDTHS: Record<ImageSize, readonly [number, number]> = {
  avatar: [96, 192],
  thumbnail: [320, 640],
  detail: [720, 1080],
}

export function characterImageSources(original: string, size: ImageSize) {
  let url: URL
  try {
    url = new URL(original)
  } catch {
    return { src: original }
  }

  const publicPath = '/storage/v1/object/public/character-images/'
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith(publicPath) || url.pathname.length === publicPath.length) {
    return { src: original }
  }

  url.pathname = `/storage/v1/render/image/public/character-images/${url.pathname.slice(publicPath.length)}`
  url.searchParams.set('quality', '80')
  url.searchParams.set('resize', 'contain')
  const candidates = IMAGE_WIDTHS[size].map((width) => {
    url.searchParams.set('width', String(width))
    return { width, url: url.toString() }
  })
  return {
    src: candidates[0]!.url,
    srcSet: candidates.map(({ width, url: candidate }) => `${candidate} ${width}w`).join(', '),
  }
}

export function CharacterPhoto({ src, alt, size, sizes, width, height, loading = 'lazy', style }: {
  src: string; alt: string; size: ImageSize; sizes: string; width: number; height: number
  loading?: 'eager' | 'lazy'; style?: React.CSSProperties
}) {
  const [failed, setFailed] = useState(false)
  const sources = failed ? { src } : characterImageSources(src, size)
  return (
    <img src={sources.src} srcSet={'srcSet' in sources ? sources.srcSet : undefined}
      sizes={'srcSet' in sources ? sizes : undefined} alt={alt} width={width} height={height}
      loading={loading} fetchPriority={loading === 'eager' ? 'high' : undefined} decoding="async" onError={() => setFailed(true)} style={style} />
  )
}

/**
 * 캐릭터 비주얼.
 *
 * 대표 사진이 있으면 그 사진을, 없으면 이름의 글자로 존재감을 만든다 — 장식 Gradient 는 쓰지 않는다.
 * 호출부가 characters.images[0]에서 대표 사진을 정한다.
 * (Supabase Storage 의 공개 URL, 만들기에서 올린 사진).
 */
export function CharacterVisual({ name, accent, slug, photo, ratio = '4 / 5', size = 'thumbnail', loading = 'lazy', shared = true, scrim = true, className, style }: {
  name: string; accent: string | null; slug: string
  /** 대표 사진 경로. 없으면 글자 자리표시. */
  photo?: string | null
  ratio?: string; size?: ImageSize; loading?: 'eager' | 'lazy'; shared?: boolean; scrim?: boolean; className?: string; style?: React.CSSProperties
}) {
  return (
    <div aria-hidden="true" className={className} style={{
      position: 'relative', aspectRatio: ratio, width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface-1)',
      viewTransitionName: shared ? `hero-${slug}` : undefined, ...style,
    }}>
      {photo ? (
        <CharacterPhoto key={photo} src={photo} alt="" size={size} loading={loading}
          sizes={size === 'detail' ? '(max-width: 768px) 100vw, 720px' : '(max-width: 600px) 50vw, 320px'}
          width={880} height={1168}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} />
      ) : (
        <span className="t-name" style={{ position: 'absolute', right: -6, bottom: -22, fontSize: 'clamp(120px, 42vw, 240px)', lineHeight: 1, color: accent ?? 'var(--color-surface-3)', opacity: 0.16, letterSpacing: '-0.06em', userSelect: 'none' }}>
          {name.slice(0, 1)}
        </span>
      )}
      {scrim && <div className="scrim" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' }} />}
    </div>
  )
}
