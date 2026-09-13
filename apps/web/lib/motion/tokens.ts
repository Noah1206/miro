/**
 * MIRO Motion Tokens — 하나의 언어.
 * "이 버튼 0.28초" 가 아니라 `spring.quick` / `ease.enter` 로 말한다.
 * 방향: Bounce 가 아니라 Flow 와 Tension. 스프링은 전부 과감쇠(overshoot 없음)에 가깝다.
 */
import type { Transition } from 'motion/react'

export const duration = { fast: 0.22, normal: 0.44, slow: 0.68, scene: 1.0 } as const

export const ease = {
  standard: [0.32, 0.72, 0.24, 1],
  /**
   * 등장 곡선. 끝에서 급히 멈추지 않고 길게 흘러들어온다 —
   * 앞이 완만할수록 '툭 나타났다' 가 아니라 '떠오른다' 로 읽힌다.
   */
  enter: [0.22, 0.86, 0.24, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, [number, number, number, number]>

export const spring = {
  /** 눌림 복원, 작은 요소. 아주 약한 되돌림만. */
  quick: { type: 'spring', stiffness: 560, damping: 42, mass: 1 },
  /** 카드·시트 정착. */
  default: { type: 'spring', stiffness: 260, damping: 32, mass: 1 },
  /** 큰 면(시트 전체, 화면 단위). */
  gentle: { type: 'spring', stiffness: 130, damping: 24, mass: 1 },
} as const satisfies Record<string, Transition>

export const tween = {
  fast: { duration: duration.fast, ease: ease.standard },
  /** 등장은 느긋하게 — 문장이 '나타나는' 게 보여야 한다. */
  enter: { duration: duration.slow, ease: ease.enter },
  exit: { duration: duration.fast, ease: ease.exit },
  scene: { duration: duration.scene, ease: ease.enter },
} as const satisfies Record<string, Transition>

/** 손가락이 닿는 순간의 반응. 90ms 안에 눌린 게 보여야 싸구려처럼 느껴지지 않는다. */
export const press = { scale: 0.97, downMs: 90, brightness: 0.94 } as const

export const stagger = { tight: 0.08, normal: 0.12, loose: 0.2 } as const

/** pointermove 가 이 이상이면 tap 이 아니라 drag/scroll 이다. */
export const tapSlopPx = 10
export const longPress = { delayMs: 500, slopPx: 10 } as const

/* variants used everywhere */
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: tween.enter },
  exit: { opacity: 0, y: 4, transition: tween.exit },
} as const

export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: tween.enter },
  exit: { opacity: 0, transition: tween.exit },
} as const

export const staggerParent = (gap: number = stagger.normal, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
})
