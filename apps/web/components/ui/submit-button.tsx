'use client'
import { useFormStatus } from 'react-dom'
import { Button } from './button'

/**
 * <form action={serverAction}> 의 제출 버튼. 제출 중이면 loading 을 보이고 잠근다 —
 * 패턴 문서 §7.2: Loading 상태에서는 중복 입력을 막는다. 서버 컴포넌트 폼에서도 그대로 쓴다.
 */
export function SubmitButton({ disabled, children, ...rest }: Omit<React.ComponentProps<typeof Button>, 'type' | 'status'>) {
  const { pending } = useFormStatus()
  return <Button type="submit" status={pending ? 'loading' : 'idle'} disabled={disabled || pending} {...rest}>{children}</Button>
}
