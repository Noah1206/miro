'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { readWallet, openWalletChannel } from '@/app/(main)/recharge/wallet-actions'
import type { WalletSnapshot } from '@/lib/wallet/types'

const amounts = (value: WalletSnapshot) => `${value.available}:${value.rechargeRemaining}:${value.monthlyRemaining}`

/** Shared display only. Every debit and payment is still authorized by the server ledger. */
export function useWalletBalance(userId: string | null) {
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null)
  const current = useRef<WalletSnapshot | null>(null)
  const revision = useRef(0)
  const pending = useRef<Promise<WalletSnapshot | null> | null>(null)
  const [live, setLive] = useState<'connecting' | 'connected' | 'unavailable'>('connecting')
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

  // 페이지를 옮길 때마다 읽지 않는다(10/27) — 서버 액션이 라우터 대기열에 끼어 이동을 늦추고 미리 받은 탭을 지웠다.
  // 처음 한 번 + 실시간 알림·포커스·복귀·탭 간 신호·턴 뒤 강제 갱신으로 충분하다.
  useEffect(() => { void refreshBalance() }, [refreshBalance])
  useEffect(() => {
    if (!userId) { setLive('unavailable'); return }
    let disposed = false
    let cleanup: (() => void) | undefined
    let queued: ReturnType<typeof setTimeout> | undefined
    setLive('connecting')
    void (async () => {
      const config = await openWalletChannel()
      if (disposed) return
      if (!config || config.userId !== userId) { setLive('unavailable'); return }
      const { createClient } = await import('@supabase/supabase-js')
      if (disposed) return
      const client = createClient(config.url, config.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      const channel = client.channel(config.topic, { config: { private: false } })
        .on('broadcast', { event: 'wallet_changed' }, () => {
          // A transaction can change several wallet rows. Read once per burst.
          if (queued) clearTimeout(queued)
          queued = setTimeout(() => { queued = undefined; if (!disposed) void refreshBalance(true) }, 30)
        })
        .subscribe(status => {
          if (disposed) return
          setLive(status === 'SUBSCRIBED' ? 'connected' : 'connecting')
          // Includes reconnect: catch changes missed while offline, with no poll.
          if (status === 'SUBSCRIBED') void refreshBalance(true)
        })
      cleanup = () => { void client.removeChannel(channel) }
    })().catch(() => { if (!disposed) setLive('unavailable') })
    return () => { disposed = true; if (queued) clearTimeout(queued); cleanup?.() }
  }, [userId, refreshBalance])
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') void refreshBalance() }
    const changed = (event: StorageEvent) => {
      if (event.key !== marker || !event.newValue) return
      void refreshBalance(true)
    }
    window.addEventListener('storage', changed)
    window.addEventListener('focus', visible)
    window.addEventListener('pageshow', visible)
    window.addEventListener('online', visible)
    document.addEventListener('visibilitychange', visible)
    return () => {
      revision.current++
      pending.current = null
      window.removeEventListener('storage', changed)
      window.removeEventListener('focus', visible)
      window.removeEventListener('pageshow', visible)
      window.removeEventListener('online', visible)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [marker, refreshBalance])
  return { wallet, seed, sync, refreshBalance, live }
}
