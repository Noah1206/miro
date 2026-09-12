/**
 * 캐릭터 비주얼 자리. Image Provider 가 붙으면 여기만 <img> 로 바뀐다.
 * 그때까지는 색이 아니라 이름의 글자로 존재감을 만든다 — 장식 Gradient 는 쓰지 않는다.
 */
export function CharacterVisual({ name, accent, slug, ratio = '4 / 5', shared = true, className, style }: {
  name: string; accent: string | null; slug: string; ratio?: string; shared?: boolean; className?: string; style?: React.CSSProperties
}) {
  return (
    <div aria-hidden="true" className={className} style={{
      position: 'relative', aspectRatio: ratio, width: '100%', overflow: 'hidden', borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface-1)', border: '1px solid var(--color-border)',
      viewTransitionName: shared ? `hero-${slug}` : undefined, ...style,
    }}>
      <span className="t-name" style={{ position: 'absolute', right: -6, bottom: -22, fontSize: 'clamp(120px, 42vw, 240px)', lineHeight: 1, color: accent ?? 'var(--color-surface-3)', opacity: 0.16, letterSpacing: '-0.06em', userSelect: 'none' }}>
        {name.slice(0, 1)}
      </span>
      <div className="scrim" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' }} />
    </div>
  )
}
