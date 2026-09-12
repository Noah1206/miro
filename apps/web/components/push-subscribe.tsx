'use client'
import { useEffect, useState } from 'react'
import { Button, Modal, useToast } from '@/components/ui'

type Status = 'unsupported' | 'unconfigured' | 'prompt' | 'subscribed' | 'denied' | 'working'

/** 캐릭터가 앱 밖에서 먼저 연락할 수 있게. iOS Safari 는 홈 화면에 추가된 PWA 에서만 Push 를 허용한다. */
export function PushSubscribe({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>('working')
  const [ask, setAsk] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setStatus('unsupported')
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
    unconfigured: 'Push Provider 미구성 — 캐릭터의 연락은 앱 안에서만 확인할 수 있습니다.',
    prompt: '앱을 닫아도 먼저 연락이 오게 하려면',
    denied: '알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.',
    working: '확인 중…',
  }
  return (
    <>
      <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <span className="t-caption">{text[status]}</span>
        {status === 'prompt' && <Button size="sm" variant="secondary" type="button" onClick={() => setAsk(true)}>알림 켜기</Button>}
      </div>
      <Modal open={ask} onClose={() => setAsk(false)} title="먼저 연락이 올 수 있게">
        <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>캐릭터는 자기 사정과 관계에 따라 가끔 먼저 연락합니다. 야간 연락은 기본으로 막혀 있고, 설정에서 바꿀 수 있어요.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={() => setAsk(false)}>나중에</Button>
          <Button variant="primary" type="button" onClick={subscribe}>허용</Button>
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
