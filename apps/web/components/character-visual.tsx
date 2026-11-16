'use client'

import { useState } from 'react'

type ImageSize = 'avatar' | 'thumbnail' | 'detail'

const IMAGE_WIDTHS: Record<ImageSize, readonly [number, number]> = {
  avatar: [96, 192],
  thumbnail: [320, 640],
  detail: [720, 1080],
}

const MEDIA = '/media/character-images/'
const OLD_PUBLIC = '/storage/v1/object/public/character-images/'
/**
 * 우리 사진의 서버 경로(/media/character-images/…). 11/16 사진을 Supabase Storage 에서 운영 서버 디스크로 옮겼다 —
 * 예전 Supabase 주소로 저장된 것도 같은 파일이라 여기서 새 경로로 읽는다. 우리 사진이 아니면 null.
 */
export function ownImagePath(original: string): string | null {
  if (original.startsWith(MEDIA)) return original
  try {
    const url = new URL(original)
    return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith(OLD_PUBLIC) && url.pathname.length > OLD_PUBLIC.length
      ? MEDIA + url.pathname.slice(OLD_PUBLIC.length) + url.search : null
  } catch { return null }
}

/** 화면 크기에 맞게 줄인 사진 주소들 — Next 이미지 변환(/_next/image)이 줄이고 WebP 로 바꿔 서버 디스크에 캐시한다. */
export function characterImageSources(original: string, size: ImageSize) {
  const path = ownImagePath(original)
  if (!path) return { src: original }
  const file = path.split('?')[0]!
  // 움직이는 썸네일(11/4, animated WebP) — 크기 변환을 거치면 첫 장만 남는다. 원본 그대로.
  if (file.endsWith('.webp')) return { src: path }
  const candidates = IMAGE_WIDTHS[size].map((width) => ({ width, url: `/_next/image?url=${encodeURIComponent(file)}&w=${width}&q=80` }))
  return {
    src: candidates[0]!.url,
    srcSet: candidates.map(({ width, url: candidate }) => `${candidate} ${width}w`).join(', '),
  }
}

export function CharacterPhoto({ src, alt, size, sizes, width, height, loading = 'lazy', style, onReady }: {
  src: string; alt: string; size: ImageSize; sizes: string; width: number; height: number
  loading?: 'eager' | 'lazy'; style?: React.CSSProperties
  /** 11/6: 다 받고 그릴 준비가 끝났을 때(이미 캐시에 있어도 한 번) — 카드 자동 넘김이 준비된 사진으로만 넘어가게. */
  onReady?: () => void
}) {
  const [failed, setFailed] = useState(false)
  const sources = failed ? { src: ownImagePath(src) ?? src } : characterImageSources(src, size)
  return (
    <img src={sources.src} srcSet={'srcSet' in sources ? sources.srcSet : undefined}
      sizes={'srcSet' in sources ? sizes : undefined} alt={alt} width={width} height={height}
      loading={loading} fetchPriority={loading === 'eager' ? 'high' : undefined} decoding="async" onError={() => setFailed(true)} style={style}
      ref={onReady ? el => { if (el?.complete && el.naturalWidth) el.decode().then(onReady, onReady) } : undefined}
      onLoad={onReady ? e => { e.currentTarget.decode().then(onReady, onReady) } : undefined} />
  )
}

/**
 * 캐릭터 비주얼.
 *
 * 대표 사진이 있으면 그 사진을, 없으면 이름의 글자로 존재감을 만든다 — 장식 Gradient 는 쓰지 않는다.
 * 호출부가 characters.images[0]에서 대표 사진을 정한다.
 * (Supabase Storage 의 공개 URL, 만들기에서 올린 사진).
 */
export function CharacterVisual({ name, accent, slug, photo, photos, active = 0, onPhotoReady, ratio = '4 / 5', size = 'thumbnail', loading = 'lazy', shared = true, scrim = true, className, style }: {
  name: string; accent: string | null; slug: string
  /** 대표 사진 경로. 없으면 글자 자리표시. */
  photo?: string | null
  /** 11/6: 카드 자동 넘김 — 사진을 겹쳐 두고 active 장만 보인다(src 를 바꾸면 새로 받는 동안 깜빡였다). */
  photos?: string[]; active?: number; onPhotoReady?: (i: number) => void
  ratio?: string; size?: ImageSize; loading?: 'eager' | 'lazy'; shared?: boolean; scrim?: boolean; className?: string; style?: React.CSSProperties
}) {
  return (
    <div aria-hidden="true" className={className} style={{
      position: 'relative', aspectRatio: ratio, width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface-1)',
      viewTransitionName: shared ? `hero-${slug}` : undefined, ...style,
    }}>
      {photos && photos.length > 1 ? photos.map((src, i) => (
        <CharacterPhoto key={src} src={src} alt="" size={size} loading={loading}
          sizes={size === 'detail' ? '(max-width: 768px) 100vw, 720px' : '(max-width: 600px) 50vw, 320px'}
          width={880} height={1168}
          style={{ position: 'absolute', inset: -1, width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', objectFit: 'cover', objectPosition: 'center 25%', opacity: i === active ? 1 : 0 }} onReady={() => onPhotoReady?.(i)} />
      )) : photo ? (
        <CharacterPhoto key={photo} src={photo} alt="" size={size} loading={loading}
          sizes={size === 'detail' ? '(max-width: 768px) 100vw, 720px' : '(max-width: 600px) 50vw, 320px'}
          width={880} height={1168}
          style={{ position: 'absolute', inset: -1, width: 'calc(100% + 2px)', height: 'calc(100% + 2px)', objectFit: 'cover', objectPosition: 'center 25%' }} />
      ) : (
        <span className="t-name" style={{ position: 'absolute', right: -6, bottom: -22, fontSize: 'clamp(120px, 42vw, 240px)', lineHeight: 1, color: accent ?? 'var(--color-surface-3)', opacity: 0.16, letterSpacing: '-0.06em', userSelect: 'none' }}>
          {name.slice(0, 1)}
        </span>
      )}
      {scrim && <div className="scrim" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' }} />}
    </div>
  )
}
