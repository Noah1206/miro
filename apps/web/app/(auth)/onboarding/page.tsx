'use client'
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ButtonLink, LogoIntro, Reveal, Stagger, StaggerItem } from '@/components/ui'
import { tween } from '@/lib/motion/tokens'

const LINES = [
  ['한 사람을 고르거나, 만든다.', '외형·성격·세계를 한 문장으로도, 세밀하게도.'],
  ['대사와 행동을 자유롭게 섞는다.', '선택지가 아니라 당신의 방식으로.'],
  ['앱을 닫아도 관계는 이어진다.', '세계는 계속 움직이고, 먼저 연락이 오기도 한다.'],
]

/** n3/n4 — 검은 무대 → 로고 두 조각 → 하나 → 벌어지며 세계가 열린다. 그 뒤에야 문장이 온다. */
export default function Onboarding() {
  const [opened, setOpened] = useState(false)
  return (
    <main className="page page--immersive" style={{ minHeight: '100dvh', background: 'var(--color-bg-deep)', display: 'flex', flexDirection: 'column' }}>
      <h1 className="sr-only">MIRO — 한 사람의 세계 안으로</h1>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <LogoIntro onDone={() => setOpened(true)} />
      </div>
      <AnimatePresence>
        {opened && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tween.scene} style={{ padding: '0 var(--space-5) var(--space-7)', maxWidth: 480, width: '100%', margin: '0 auto' }}>
            <Stagger as="ul" gap={0.07} style={{ listStyle: 'none', padding: 0, margin: '0 0 var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {LINES.map(([t, b]) => (
                <StaggerItem as="li" key={t}>
                  <p className="t-title-3 t-quote" style={{ marginBottom: 4 }}>{t}</p>
                  <p className="t-caption">{b}</p>
                </StaggerItem>
              ))}
            </Stagger>
            <Reveal delay={0.3}>
              <ButtonLink href="/login" variant="primary" size="lg" full>시작하기</ButtonLink>
            </Reveal>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
