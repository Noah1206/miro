'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { MessengerItem } from '@/lib/messenger/inbox'
import { useChatModel } from '@/app/(main)/chat/[sessionId]/model-picker'
import { useWallet } from '@/components/wallet/provider'

type DeliveryItem = MessengerItem & { delivery?: 'sending' | 'failed' }
type Delivery = { items: DeliveryItem[]; send: (text: string) => void; retry: (id: string) => void }
const Context = createContext<Delivery>({ items: [], send: () => {}, retry: () => {} })
export const useMessenger = () => useContext(Context)

export function MessengerDelivery({ sessionId, initial, children }: { sessionId: string; initial: MessengerItem[]; children: ReactNode }) {
  const { model } = useChatModel()
  const { refreshBalance } = useWallet()
  const walletItems = useRef('')
  const [items, setItems] = useState<DeliveryItem[]>(initial)
  const inflight = useRef(new Set<string>())
  const mounted = useRef(true)
  const post = useCallback(async (item: DeliveryItem) => {
    if (inflight.current.has(item.id)) return
    inflight.current.add(item.id)
    setItems(previous => previous.map(value => value.id === item.id ? { ...value, delivery: 'sending' } : value))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch('/api/messages', { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, requestId: item.id, input: item.content, sentAt: item.at, chatModel: item.chatModel ?? undefined }) })
      const result = await response.json()
      if (!response.ok || !result.message) throw new Error('send_failed')
      if (mounted.current) setItems(previous => previous.map(value => value.id === item.id ? result.message : value))
    } catch {
      if (mounted.current) setItems(previous => previous.map(value => value.id === item.id ? { ...value, delivery: 'failed' } : value))
    } finally { clearTimeout(timeout); inflight.current.delete(item.id); void refreshBalance(true) }
  }, [sessionId, refreshBalance])
  const send = useCallback((text: string) => {
    const item: DeliveryItem = { id: crypto.randomUUID(), role: 'user', kind: 'messenger', content: text.trim(), blocks: [], at: new Date().toISOString(), readAt: null, chatModel: model, delivery: 'sending' }
    setItems(previous => [...previous, item])
    void post(item)
  }, [post, model])
  const retry = useCallback((id: string) => { const item = items.find(value => value.id === id); if (item) void post(item) }, [items, post])
  useEffect(() => {
    mounted.current = true
    let disposed = false, checking = false
    const controller = new AbortController()
    const refresh = async () => {
      if (disposed || checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const response = await fetch(`/api/messages?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        const result = await response.json() as { items: MessengerItem[] }
        const signature = result.items.map(item => `${item.id}:${item.readAt ?? ''}`).join('|')
        if (!disposed && signature !== walletItems.current) {
          walletItems.current = signature
          void refreshBalance(true)
        }
        if (!disposed) setItems(previous => {
          const known = new Set(result.items.map(item => item.id))
          return [...result.items, ...previous.filter(item => !known.has(item.id))]
        })
      } catch { /* A poll failure does not alter message delivery or the draft. */ }
      finally { checking = false }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 5000)
    const visible = () => { void refresh() }
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    return () => { disposed = true; mounted.current = false; controller.abort(); clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible) }
  }, [sessionId, refreshBalance])
  return <Context.Provider value={{ items, send, retry }}>{children}</Context.Provider>
}
