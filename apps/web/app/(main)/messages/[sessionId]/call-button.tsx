'use client'
import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@/components/wallet/provider'
import { requestVoiceCall } from './actions'
import styles from './messages.module.css'

export function CallButton({ sessionId, cost }: { sessionId: string; cost: number }) {
  const { requireBalance, busy } = useWallet()
  const router = useRouter()
  const requestId = useRef<string | null>(null)
  return <button type="button" className={styles.headerButton} aria-label="통화" title={`음성통화 · 1분당 ${cost} 크레딧`} aria-busy={busy} disabled={busy}
    onClick={() => {
      requestId.current ??= crypto.randomUUID()
      void requireBalance(cost, async () => {
        const result = await requestVoiceCall(sessionId, requestId.current!)
        // Keep the key until this page unmounts: a second click during navigation is a replay too.
        if (result.status === 'success') router.push(`/call/${result.callId}`)
        return result
      }, '음성통화 1분')
    }}>
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
  </button>
}
