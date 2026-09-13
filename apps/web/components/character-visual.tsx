/**
 * 캐릭터 비주얼.
 *
 * 대표 사진이 있으면 그 사진을, 없으면 이름의 글자로 존재감을 만든다 —
 * 장식 Gradient 는 쓰지 않는다. 사진은 slug 로 찾으므로 공식 캐릭터가 먼저 갖는다.
 * (사용자 생성 캐릭터의 대표 사진은 Image Provider 가 붙은 뒤 여기에 이어진다.)
 */
export function CharacterVisual({ name, accent, slug, photo, ratio = '4 / 5', shared = true, className, style }: {
  name: string; accent: string | null; slug: string
  /** 대표 사진 경로. 없으면 글자 자리표시. */
  photo?: string | null
  ratio?: string; shared?: boolean; className?: string; style?: React.CSSProperties
}) {
  return (
    <div aria-hidden="true" className={className} style={{
      position: 'relative', aspectRatio: ratio, width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface-1)',
      viewTransitionName: shared ? `hero-${slug}` : undefined, ...style,
    }}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" width={880} height={1168} loading="lazy" decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} />
      ) : (
        <span className="t-name" style={{ position: 'absolute', right: -6, bottom: -22, fontSize: 'clamp(120px, 42vw, 240px)', lineHeight: 1, color: accent ?? 'var(--color-surface-3)', opacity: 0.16, letterSpacing: '-0.06em', userSelect: 'none' }}>
          {name.slice(0, 1)}
        </span>
      )}
      <div className="scrim" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' }} />
    </div>
  )
}

/** 공식 캐릭터의 대표 사진. 파일이 있는 slug 만 여기에 둔다. */
const PORTRAITS: Record<string, string> = {
  thomas: '/characters/thomas.webp',
  taeyun: '/characters/taeyun.webp',
  hisashi: '/characters/hisashi.webp',
}
export const portraitFor = (slug: string | null | undefined): string | null =>
  (slug && PORTRAITS[slug]) || null

/** 소개 섹션에 얹는 장면 사진. 인물이 없는 그 세계의 공간이다. */
const SCENES: Record<string, string> = {
  thomas: '/characters/thomas-scene.webp',
  taeyun: '/characters/taeyun-scene.webp',
  hisashi: '/characters/hisashi-scene.webp',
}
export const sceneFor = (slug: string | null | undefined): string | null =>
  (slug && SCENES[slug]) || null
