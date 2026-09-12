'use client'

import { useEffect, useState } from 'react'

type Status = 'unsupported' | 'unconfigured' | 'prompt' | 'subscribed' | 'denied' | 'working'

/**
 * 캐릭터 선연락을 앱 밖에서 받기 위한 Push 구독.
 * iOS Safari 는 홈 화면에 추가된 PWA 에서만 Push 를 허용한다 (R-2).
 */
export function PushSubscribe({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>('working')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setStatus('unsupported')
    if (!vapidPublicKey) return setStatus('unconfigured')
    if (Notification.permission === 'denied') return setStatus('denied')
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? 'subscribed' : 'prompt'))
      .catch(() => setStatus('prompt'))
  }, [vapidPublicKey])

  async function subscribe() {
    if (!vapidPublicKey) return
    setStatus('working')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8(vapidPublicKey),
      })
      const res = await fetch('/api/push', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setStatus(res.ok ? 'subscribed' : 'prompt')
    } catch {
      setStatus(Notification.permission === 'denied' ? 'denied' : 'prompt')
    }
  }

  if (status === 'unsupported' || status === 'subscribed') return null

  const text: Record<Exclude<Status, 'unsupported' | 'subscribed'>, string> = {
    unconfigured: 'Push Provider 미구성 — 캐릭터의 연락은 앱 안에서만 확인할 수 있습니다.',
    prompt: '앱을 닫아도 캐릭터의 연락을 받으려면 알림을 켜세요.',
    denied: '알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.',
    working: '확인 중…',
  }

  return (
    <div role="status" style={{
      margin: '0 24px 16px', padding: '12px 14px', borderRadius: 12,
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5,
      color: 'var(--text-secondary)',
    }}>
      <span style={{ flex: 1 }}>{text[status]}</span>
      {status === 'prompt' && (
        <button type="button" onClick={subscribe} style={{
          padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
        }}>알림 켜기</button>
      )}
    </div>
  )
}

function toUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
