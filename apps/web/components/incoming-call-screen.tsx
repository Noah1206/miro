'use client'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Pressable } from '@/components/ui'
import { ease, spring, tween } from '@/lib/motion/tokens'

/**
 * Timeline: 배경 → 아바타(scale) → 이름 → 이유 → 버튼. 각 단계는 variants 의 delay 로 조립된다.
 * 음성은 원, 영상은 사각 — 받기 전에 형태만으로 구분된다.
 */
export function IncomingCallScreen({ channel, name, reason, acceptAction, declineAction }: {
  channel: 'voice' | 'video'; name: string; reason: string | null; acceptAction: () => Promise<void>; declineAction: () => Promise<void>
}) {
  const video = channel === 'video'
  const accept = useRef<HTMLButtonElement>(null)
  useEffect(() => { accept.current?.focus({ preventScroll: true }) }, [])   // 전화가 오면 초점도 온다
  const at = (d: number) => ({ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { ...tween.enter, delay: d } } })
  return (
    <motion.div data-incoming-call={channel} role="dialog" aria-label={video ? '수신 영상통화' : '수신 음성통화'}
      initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.3, ease: ease.enter } } }}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 14, padding: 24, background: 'var(--color-bg-deep)' }}>
      <motion.p variants={at(0.15)} className="t-micro" style={{ color: video ? 'var(--color-relationship)' : 'var(--color-text-secondary)' }}>{video ? '● 영상통화 수신' : '음성통화 수신'}</motion.p>
      <motion.div variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1, transition: { ...spring.default, delay: 0.25 } } }}
        style={{ width: 120, height: 120, borderRadius: video ? 'var(--radius-lg)' : 999, background: 'var(--color-surface-2)', border: `1px solid ${video ? 'var(--color-white)' : 'var(--color-border-strong)'}`, display: 'grid', placeItems: 'center' }}>
        <span className="t-name" style={{ fontSize: 44, color: 'var(--color-text-tertiary)' }}>{name.slice(0, 1)}</span>
      </motion.div>
      <motion.h2 variants={at(0.4)} className="t-display t-name">{name}</motion.h2>
      {reason && <motion.p variants={at(0.5)} className="t-caption t-quote">{reason}</motion.p>}
      <motion.div variants={at(0.65)} style={{ display: 'flex', gap: 28, marginTop: 28 }}>
        <form action={declineAction}><Pressable type="submit" style={round('#E65A5A', '#fff')}>거절</Pressable></form>
        <form action={acceptAction}><Pressable ref={accept} type="submit" style={round('#FFFFFF', '#000')}>{video ? '영상으로 받기' : '받기'}</Pressable></form>
      </motion.div>
    </motion.div>
  )
}
const round = (bg: string, fg: string): React.CSSProperties => ({ width: 88, height: 88, borderRadius: 999, border: 0, background: bg, color: fg, fontSize: 'var(--font-caption)', fontWeight: 'var(--weight-semibold)' })
