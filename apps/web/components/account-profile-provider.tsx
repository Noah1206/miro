'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { AccountProfile } from '@/lib/account-profile'
import { readAccountProfile } from '@/app/(main)/my/profile-actions'

type ProfileContext = {
  profile: AccountProfile | null
  sync: (profile: AccountProfile) => void
  refresh: () => Promise<void>
}
const Context = createContext<ProfileContext | null>(null)

/** Only an invalidation marker crosses tabs; identity always comes from the signed-in server session. */
export function AccountProfileProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const pathname = usePathname()
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const revision = useRef(0)
  const pending = useRef<Promise<void> | null>(null)
  const marker = userId ? `miro:account-profile:${userId}` : null
  const refresh = useCallback(async () => {
    if (!userId) return
    if (pending.current) return pending.current
    const version = revision.current
    const request = readAccountProfile().then(fresh => {
      if (version === revision.current && fresh?.userId === userId) setProfile(fresh)
    }).catch(() => {
      // Keep the last saved identity during a network interruption.
    }).finally(() => { if (pending.current === request) pending.current = null })
    pending.current = request
    return request
  }, [userId])
  const sync = useCallback((saved: AccountProfile) => {
    if (saved.userId !== userId) return
    revision.current++
    pending.current = null
    setProfile(saved)
    try { if (marker) localStorage.setItem(marker, crypto.randomUUID()) } catch { /* Storage may be disabled. */ }
  }, [marker, userId])

  useEffect(() => {
    void refresh()
  }, [pathname, refresh])
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const changed = (event: StorageEvent) => {
      if (event.key !== marker || !event.newValue) return
      revision.current++
      pending.current = null
      void refresh()
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
  }, [marker, refresh])
  return <Context.Provider value={{ profile, sync, refresh }}>{children}</Context.Provider>
}

export function useAccountProfile(initial: AccountProfile) {
  const context = useContext(Context)
  if (!context) throw new Error('AccountProfileProvider missing')
  return { ...context, profile: context.profile?.userId === initial.userId ? context.profile : initial }
}

export function useProfileSync() {
  const context = useContext(Context)
  if (!context) throw new Error('AccountProfileProvider missing')
  return context.sync
}
