'use client'
import { animate, motion, useMotionValue, useReducedMotion, type HTMLMotionProps } from 'motion/react'
import { forwardRef, useEffect } from 'react'
import { usePress } from '@/lib/motion/use-press'
import { ease, fadeUp, press, spring } from '@/lib/motion/tokens'

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
 * 눌림은 MotionValue 로 직접 움직인다 — `animate` prop 을 비워 두어야 Page 의 등장 순서(variants)를 물려받는다.
 */
export const Pressable = forwardRef<HTMLButtonElement, Props>(function Pressable(
  { onLongPress, subtle, children, style, disabled, onClick, ...rest }, ref,
) {
  const reduce = useReducedMotion()
  const { pressed, handlers } = usePress({ disabled, onLongPress })
  const scale = useMotionValue(1)
  const filter = useMotionValue('brightness(1)')
  useEffect(() => {
    const down = pressed && !disabled
    const t = down ? { duration: press.downMs / 1000, ease: ease.exit } : spring.quick
    const a = animate(scale, down && !reduce && !subtle ? press.scale : 1, t)
    const b = animate(filter, down ? `brightness(${press.brightness})` : 'brightness(1)', t)
    return () => { a.stop(); b.stop() }   // 다음 상태는 현재 값에서 이어진다
  }, [pressed, disabled, reduce, subtle, scale, filter])
  return (
    <motion.button
      ref={ref}
      // Page 의 등장 순서를 물려받되, hidden 에 갇히지 않는다: AnimatePresence 안에서 다시 등장할 때
      // 부모가 이름 있는 variant 를 내려보내면 자식이 opacity 0 인 채로 남는다 (실제로 그 버그가 있었다).
      // `show` 를 기본 animate 로 두면 어느 경로로 마운트되든 보이는 상태로 정착한다.
      variants={fadeUp}
      animate="show"
      {...rest}
      {...handlers}
      onClick={onClick}
      disabled={disabled}
      data-pressed={pressed || undefined}
      style={{ scale, filter, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', ...style }}
    >
      {children}
    </motion.button>
  )
})
