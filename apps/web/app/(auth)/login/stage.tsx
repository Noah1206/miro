'use client'
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { LogoIntro, Notice, Stagger, StaggerItem } from '@/components/ui'
import { spring, stagger } from '@/lib/motion/tokens'
import { SocialButton } from '@/components/ui/social-button'
import { useT } from '@/lib/i18n/client'

export type SocialProvider = { id: 'google' | 'kakao' | 'twitter'; label: string }

/**
 * n3→n5 를 한 화면으로. 검은 무대 → 로고 두 조각이 하나가 되어 열린다 → 로고가 위로 물러나며 소셜 버튼이 온다.
 * 로고의 이동은 layout 애니메이션: 버튼 블록이 생기면 가운데 정렬이 다시 잡히고, 그 차이를 spring 으로 움직인다.
 * Reduce Motion 이면 무대 없이 바로 버튼.
 */
export function LoginStage({ providers, notice, error, next }: { providers: SocialProvider[]; notice: string | null; error: string | null; next?: string | null }) {
  const reduce = useReducedMotion()
  const t = useT()
  const [ready, setReady] = useState(false)
  useEffect(() => { if (reduce) setReady(true) }, [reduce])
  return (
    <main id="main" tabIndex={-1} className="page page--immersive" style={{ minHeight: '100dvh', background: 'var(--color-bg-deep)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 var(--space-5) var(--space-7)', outline: 'none' }}>
      <h1 className="sr-only">{t('MIRO 로그인')}</h1>
      <motion.div layout transition={spring.gentle} style={{ marginBottom: ready ? 'var(--space-9)' : 0 }}>
        <LogoIntro onDone={() => setReady(true)} />
      </motion.div>
      {ready && (
        <Stagger gap={stagger.normal} delay={0.25} style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <Notice role="alert" tone="danger">{t(error)}</Notice>}
          {notice && <Notice>⚠ {notice}</Notice>}
          {[...providers].sort((a, b) => Number(b.id === 'kakao') - Number(a.id === 'kakao')).map((p) => <StaggerItem key={p.id}><SocialButton {...p} next={next} surface="sheet" /></StaggerItem>)}
        </Stagger>
      )}
    </main>
  )
}
