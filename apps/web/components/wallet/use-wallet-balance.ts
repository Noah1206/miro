'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { readWallet } from '@/app/(main)/recharge/wallet-actions'
import type { WalletSnapshot } from '@/lib/wallet/types'

const amounts = (value: WalletSnapshot) => `${value.available}:${value.rechargeRemaining}:${value.monthlyRemaining}`

/** Shared display only. Every debit and payment is still authorized by the server ledger. */
export function useWalletBalance(userId: string | null) {
  const pathname = usePathname()
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null)
  const current = useRef<WalletSnapshot | null>(null)
  const revision = useRef(0)
  const pending = useRef<Promise<WalletSnapshot | null> | null>(null)
  const marker = userId ? `miro:wallet-changed:${userId}` : null
  const apply = useCallback((next: WalletSnapshot, notify: boolean) => {
    if (userId && next.userId !== userId) return
    const previous = current.current
    if (previous && next.observedAt < previous.observedAt) return
    current.current = next
    setWallet(next)
    if (notify && (!previous || amounts(previous) !== amounts(next))) {
      // No balance, payment details or identity are persisted in device storage.
      try { if (marker) localStorage.setItem(marker, crypto.randomUUID()) } catch { /* Private browsing may disable storage. */ }
    }
  }, [marker, userId])
  const seed = useCallback((initial: WalletSnapshot) => { apply(initial, false) }, [apply])
  const sync = useCallback((fresh: WalletSnapshot) => {
    if (userId && fresh.userId !== userId) return
    if (current.current && fresh.observedAt < current.current.observedAt) return
    revision.current++
    pending.current = null
    apply(fresh, true)
  }, [apply, userId])
  const refreshBalance = useCallback(async (force = false) => {
    if (!userId) return null
    if (force) { revision.current++; pending.current = null }
    if (pending.current) return pending.current
    const version = revision.current
    const request = readWallet(current.current?.order?.id).then(fresh => {
      if (version !== revision.current || fresh.userId !== userId) return null
      apply(fresh, true)
      return current.current
    }).catch(() => {
      // A failed read never resets the last known balance to zero.
      return null
    }).finally(() => { if (pending.current === request) pending.current = null })
    pending.current = request
    return request
  }, [apply, userId])

  useEffect(() => { void refreshBalance() }, [pathname, refreshBalance])
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') void refreshBalance() }
    const changed = (event: StorageEvent) => {
      if (event.key !== marker || !event.newValue) return
      void refreshBalance(true)
    }
    window.addEventListener('storage', changed)
    window.addEventListener('focus', visible)
    window.addEventListener('pageshow', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      revision.current++
      pending.current = null
      window.removeEventListener('storage', changed)
      window.removeEventListener('focus', visible)
      window.removeEventListener('pageshow', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [marker, refreshBalance])
  return { wallet, seed, sync, refreshBalance }
}
