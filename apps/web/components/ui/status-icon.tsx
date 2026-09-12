'use client'
import { AnimatePresence, motion } from 'motion/react'
import { spring, tween } from '@/lib/motion/tokens'

export type Status = 'idle' | 'loading' | 'success' | 'error'

/** Spinner → Check → X. 상태가 바뀔 때 교체가 아니라 변형처럼 보이게 (State Morphing). */
export function StatusIcon({ status, size = 16, color = 'currentColor' }: { status: Status; size?: number; color?: string }) {
  return (
    <span aria-hidden style={{ display: 'inline-grid', placeItems: 'center', width: size, height: size, position: 'relative' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        {status === 'loading' && (
          <motion.svg key="spin" width={size} height={size} viewBox="0 0 16 16" fill="none"
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, rotate: 360 }} exit={{ opacity: 0, scale: 0.6, transition: tween.exit }}
            transition={{ opacity: tween.fast, scale: spring.quick, rotate: { repeat: Infinity, duration: 0.9, ease: 'linear' } }}>
            <circle cx="8" cy="8" r="6" stroke={color} strokeOpacity="0.25" strokeWidth="1.75" />
            <path d="M14 8a6 6 0 0 0-6-6" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
          </motion.svg>
        )}
        {status === 'success' && (
          <motion.svg key="ok" width={size} height={size} viewBox="0 0 16 16" fill="none"
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6, transition: tween.exit }} transition={spring.quick}>
            <motion.path d="M3.5 8.5l3 3 6-7" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={tween.enter} />
          </motion.svg>
        )}
        {status === 'error' && (
          <motion.svg key="err" width={size} height={size} viewBox="0 0 16 16" fill="none"
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6, transition: tween.exit }} transition={spring.quick}>
            <path d="M4 4l8 8M12 4l-8 8" stroke={color} strokeWidth="1.75" strokeLinecap="round" />
          </motion.svg>
        )}
      </AnimatePresence>
    </span>
  )
}
