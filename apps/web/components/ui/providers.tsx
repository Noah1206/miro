'use client'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { ToastProvider } from './toast'
import { ViewTransitionResolver } from './transition-link'

/** reducedMotion="user": OS 의 Reduce Motion 을 켜면 모든 Motion 이 즉시 상태로 간다. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <ViewTransitionResolver />
        {children}
      </ToastProvider>
    </MotionConfig>
  )
}
