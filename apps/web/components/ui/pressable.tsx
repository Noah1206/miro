'use client'
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { forwardRef } from 'react'
import { usePress } from '@/lib/motion/use-press'
import { ease, press, spring } from '@/lib/motion/tokens'

export type PressableProps = Omit<HTMLMotionProps<'button'>, 'ref' | 'style' | 'children'> & {
  children?: React.ReactNode
  style?: React.CSSProperties
  onLongPress?: () => void
  /** scale 없이 밝기만 (아주 작은 요소). */
  subtle?: boolean
}
type Props = PressableProps

/**
 * 손가락이 닿는 순간 눌리고, 떼면 부드럽게 돌아온다. 중간에 다시 누르면 현재 값에서 바로 이어진다.
 * Down: 90ms ease-exit (즉시 반응)   Release: spring.quick (약한 되돌림)
 * 눌린 느낌 = scale 0.97 + brightness 0.94. 그림자 애니메이션은 쓰지 않는다 (paint 비용).
 */
export const Pressable = forwardRef<HTMLButtonElement, Props>(function Pressable(
  { onLongPress, subtle, children, style, disabled, onClick, ...rest }, ref,
) {
  const reduce = useReducedMotion()
  const { pressed, handlers } = usePress({ disabled, onLongPress })
  const scale = disabled || reduce || subtle ? 1 : pressed ? press.scale : 1
  return (
    <motion.button
      ref={ref}
      {...rest}
      {...handlers}
      onClick={onClick}
      disabled={disabled}
      data-pressed={pressed || undefined}
      animate={{ scale, filter: pressed && !disabled ? `brightness(${press.brightness})` : 'brightness(1)' }}
      transition={pressed ? { duration: press.downMs / 1000, ease: ease.exit } : spring.quick}
      style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', ...style }}
    >
      {children}
    </motion.button>
  )
})
