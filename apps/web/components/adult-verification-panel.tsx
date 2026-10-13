'use client'
import { useEffect } from 'react'
import { PortOneVerify } from '@/app/(main)/my/verify/portone'
import { VerifyForm } from '@/app/(main)/my/verify/form'
import { Notice } from '@/components/ui'
import type { adultVerificationState } from '@/app/(main)/my/verify/actions'

type State = Awaited<ReturnType<typeof adultVerificationState>>
export function AdultVerificationPanel({ state, onDone, returnTo }: { state: State; onDone: () => void; returnTo: string }) {
  useEffect(() => { if (state.verified) onDone() }, [state.verified, onDone])
  if (state.verified) return null
  if (state.locked) return <p role="alert">{state.locked}</p>
  return <>
    {state.notice && <Notice>{state.notice}</Notice>}
    {state.client ? <PortOneVerify {...state.client} prefix={state.prefix} notice={null} onDone={onDone} returnTo={returnTo} /> : <VerifyForm onDone={onDone} />}
  </>
}
