'use client'
import { useEffect, useState } from 'react'
import { Button, Modal, useToast } from '@/components/ui'

type Status = 'unsupported' | 'ios_install' | 'unconfigured' | 'prompt' | 'subscribed' | 'denied' | 'working'

/**
 * 캐릭터가 앱 밖에서 먼저 연락할 수 있게. 설정의 '먼저 연락 알림' 스위치 아래에 붙는다 —
 * 스위치는 우리 쪽 값이고, 실제로 알림이 오려면 브라우저 권한과 구독이 따로 있어야 한다.
 * iOS Safari 는 홈 화면에 추가된 PWA 에서만 Push 를 허용한다.
 */
export function PushSubscribe({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>('working')
  const [ask, setAsk] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // iPhone 브라우저에는 PushManager 자체가 없다 — 막힌 게 아니라 홈 화면에 추가하면 열린다.
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
      return setStatus(ios && !standalone ? 'ios_install' : 'unsupported')
    }
    if (!vapidPublicKey) return setStatus('unconfigured')
    if (Notification.permission === 'denied') return setStatus('denied')
    navigator.serviceWorker.register('/sw.js').then((reg) => reg.pushManager.getSubscription()).then((sub) => setStatus(sub ? 'subscribed' : 'prompt')).catch(() => setStatus('prompt'))
  }, [vapidPublicKey])

  async function subscribe() {
    if (!vapidPublicKey) return
    setAsk(false); setStatus('working')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(vapidPublicKey) })
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
      setStatus(res.ok ? 'subscribed' : 'prompt'); if (res.ok) toast('이제 먼저 연락이 올 수 있어요.', 'relationship')
    } catch { setStatus(Notification.permission === 'denied' ? 'denied' : 'prompt') }
  }

  if (status === 'unsupported' || status === 'subscribed') return null
  const text: Record<Exclude<Status, 'unsupported' | 'subscribed'>, string> = {
    ios_install: 'iPhone에서는 공유 → 홈 화면에 추가한 뒤 알림을 켤 수 있어요.',
    unconfigured: 'Push Provider 미구성 — 캐릭터의 연락은 앱 안에서만 확인할 수 있습니다.',
    prompt: '앱을 닫아도 먼저 연락이 오게 하려면',
    denied: '알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.',
    working: '확인 중…',
  }
  return (
    <>
      {/* 스위치 행 안에 붙는 한 줄 — 테두리는 바깥(Rows)이 긋는다. */}
      <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
        <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{text[status]}</span>
        {status === 'prompt' && <Button size="sm" variant="secondary" type="button" onClick={() => setAsk(true)}>알림 켜기</Button>}
      </div>
      <Modal open={ask} onClose={() => setAsk(false)} title="먼저 연락이 올 수 있게">
        <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>캐릭터는 자기 사정과 관계에 따라 가끔 먼저 연락합니다. 야간 연락은 기본으로 막혀 있고, 설정에서 바꿀 수 있어요.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={() => setAsk(false)}>나중에</Button>
          <Button variant="primary" type="button" onClick={subscribe} status={status === 'working' ? 'loading' : 'idle'} disabled={status === 'working'}>허용</Button>
        </div>
      </Modal>
    </>
  )
}
function toUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded); const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
