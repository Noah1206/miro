'use client'
import { useEffect } from 'react'

/** 화면에 들어온 것을 한 번 기록한다. 실패해도 조용하다. */
export function TrackView({ event }: { event: 'landing_view' | 'waitlist_view' }) {
  useEffect(() => {
    fetch('/api/alpha/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true }).catch(() => {})
  }, [event])
  return null
}
