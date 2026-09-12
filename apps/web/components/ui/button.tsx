'use client'
import { forwardRef } from 'react'
import { Pressable, type PressableProps } from './pressable'
import { StatusIcon, type Status } from './status-icon'
import { TransitionLink } from './transition-link'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' | 'relationship'
type Props = PressableProps & {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  /** loading / success / error 는 상태 변형으로 표시된다. 라벨(접근성 이름)은 유지한다. */
  status?: Status
  full?: boolean
  onLongPress?: () => void
}

const VARIANT: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: 'var(--color-white)', color: 'var(--color-black)', border: '1px solid var(--color-white)' },
  secondary: { background: 'var(--color-surface-2)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' },
  ghost: { background: 'transparent', color: 'var(--color-text-primary)', border: '1px solid transparent' },
  danger: { background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--color-border)' },
  /** 되돌릴 수 없는 확정. 채움은 danger-strong — 흰 글자가 4.5:1 을 넘는다. */
  destructive: { background: 'var(--color-danger-strong)', color: 'var(--color-white)', border: '1px solid var(--color-danger-strong)' },
  /** 관계 변화의 순간에만. 장식용으로 쓰지 않는다. */
  relationship: { background: 'var(--color-relationship)', color: 'var(--color-white)', border: '1px solid var(--color-relationship)' },
}
const SIZE = {
  sm: { minHeight: 36, padding: '6px 14px', fontSize: 'var(--font-caption)' },
  md: { minHeight: 48, padding: '10px 20px', fontSize: 'var(--font-body-size)' },
  lg: { minHeight: 56, padding: '12px 24px', fontSize: 'var(--font-body-lg)' },
} as const

/** Primary = 흰 배경 + 검은 글자. Gradient / Glow / Pill 없음. */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', status = 'idle', full, children, style, disabled, ...rest }, ref,
) {
  const busy = status === 'loading'
  return (
    <Pressable
      ref={ref}
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: full ? '100%' : undefined, borderRadius: 'var(--radius-button)', fontWeight: 'var(--weight-semibold)',
        whiteSpace: 'nowrap', opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
        ...SIZE[size], ...VARIANT[variant], ...style,
      }}
    >
      {status !== 'idle' && <StatusIcon status={status} size={size === 'sm' ? 14 : 16} />}
      <span>{children}</span>
    </Pressable>
  )
})

/**
 * 버튼처럼 보이는 링크. <a> 안에 <button> 을 넣지 않는다 — 중첩 인터랙티브는 스크린리더와 키보드를 깨뜨린다.
 * 눌림 반응은 Pressable 과 같은 규칙(scale 0.97 / brightness) 을 CSS 로 준다.
 */
export function ButtonLink({ href, variant = 'secondary', size = 'md', full, children, direction, style, ...rest }: {
  href: string; variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; full?: boolean; children: React.ReactNode
  direction?: 'forward' | 'back'; style?: React.CSSProperties
} & Omit<React.ComponentPropsWithoutRef<'a'>, 'href' | 'style'>) {
  return (
    <TransitionLink href={href} direction={direction} {...rest} className={`button-link ${rest.className ?? ''}`} style={{
      display: full ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: full ? '100%' : undefined,
      borderRadius: 'var(--radius-button)', fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap', ...SIZE[size], ...VARIANT[variant], ...style,
    }}>
      {children}
    </TransitionLink>
  )
}
