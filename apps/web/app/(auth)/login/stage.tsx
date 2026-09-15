'use client'
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { LogoIntro, Notice, Stagger, StaggerItem } from '@/components/ui'
import { spring, stagger } from '@/lib/motion/tokens'

export type SocialProvider = { id: 'google' | 'kakao'; label: string }

/**
 * n3→n5 를 한 화면으로. 검은 무대 → 로고 두 조각이 하나가 되어 열린다 → 로고가 위로 물러나며 소셜 버튼이 온다.
 * 로고의 이동은 layout 애니메이션: 버튼 블록이 생기면 가운데 정렬이 다시 잡히고, 그 차이를 spring 으로 움직인다.
 * Reduce Motion 이면 무대 없이 바로 버튼.
 */
export function LoginStage({ providers, notice, error, next }: { providers: SocialProvider[]; notice: string | null; error: string | null; next?: string | null }) {
  const reduce = useReducedMotion()
  const [ready, setReady] = useState(false)
  useEffect(() => { if (reduce) setReady(true) }, [reduce])
  return (
    <main id="main" tabIndex={-1} className="page page--immersive" style={{ minHeight: '100dvh', background: 'var(--color-bg-deep)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 var(--space-5) var(--space-7)', outline: 'none' }}>
      <h1 className="sr-only">MIRO 로그인</h1>
      <motion.div layout transition={spring.gentle} style={{ marginBottom: ready ? 'var(--space-9)' : 0 }}>
        <LogoIntro onDone={() => setReady(true)} />
      </motion.div>
      {ready && (
        <Stagger gap={stagger.normal} delay={0.25} style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <Notice role="alert" tone="danger">{error}</Notice>}
          {notice && <Notice>⚠ {notice}</Notice>}
          {providers.map((p) => <StaggerItem key={p.id}><SocialButton {...p} next={next} /></StaggerItem>)}
        </Stagger>
      )}
    </main>
  )
}

/**
 * 브랜드 규정: Google 흰 바탕, Kakao #FEE500 에 검정 글자, Naver 는 초록 위 흰 글자가 2.3:1 이라
 * 초록을 아이콘에만 쓰고 글자는 어두운 면 위 흰색으로 둔다 (AA).
 */
function SocialButton({ id, label, next }: SocialProvider & { next?: string | null }) {
  const style: Record<SocialProvider['id'], React.CSSProperties> = {
    google: { background: '#FFFFFF', color: '#111111', border: '1px solid #FFFFFF' },
    kakao: { background: '#FEE500', color: '#000000', border: '1px solid #FEE500' },
  }
  return (
    <a href={`/api/auth/${id}/start${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="button-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, padding: '12px 20px', borderRadius: 'var(--radius-button)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--font-body-size)', ...style[id] }}>
      <Icon id={id} />
      <span>{label}로 계속하기</span>
    </a>
  )
}
function Icon({ id }: { id: SocialProvider['id'] }) {
  if (id === 'google') return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
  )
  return <svg aria-hidden width="18" height="18" viewBox="0 0 24 24"><path fill="#000" d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.2 4.6 6.6L5.5 21l4.5-3c.7.1 1.3.1 2 .1 5.5 0 10-3.6 10-8.1S17.5 3 12 3z"/></svg>
}
