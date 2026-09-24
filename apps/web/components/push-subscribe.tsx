'use client'
import { useEffect, useState } from 'react'
import { Button, Modal, useToast } from '@/components/ui'
import { withParticle } from '@/lib/format'

type Status = 'checking' | 'unsupported' | 'ios_install' | 'unconfigured' | 'prompt' | 'subscribed' | 'denied' | 'working'

/**
 * 캐릭터가 앱 밖에서 먼저 연락할 수 있게. 미로 캐릭터 대화방에 붙는다.
 * 앱 밖 연락을 끄는 설정은 없다 (2026-09-24 결정) — 남은 건 브라우저 권한뿐이라, 구독될 때까지 여기서 묻는다.
 * 이미 허용된 기기는 묻지 않고 구독을 서버와 다시 맞춘다(다른 계정으로 바뀌었거나 서버가 실패로 표시한 경우).
 * iOS Safari 는 홈 화면에 추가된 PWA 에서만 Push 를 허용한다.
 */
export function PushSubscribe({ vapidPublicKey, name }: { vapidPublicKey: string | null; name: string }) {
  const [status, setStatus] = useState<Status>('checking')
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
    navigator.serviceWorker.register('/sw.js').then((reg) => reg.pushManager.getSubscription())
      .then((sub) => (sub || Notification.permission === 'granted') ? subscribe(true) : setStatus('prompt'))
      .catch(() => setStatus('prompt'))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe reads only vapidPublicKey
  }, [vapidPublicKey])

  /** quiet: 이미 허용된 기기 — 권한 창도 안내 문구도 없이 서버 구독만 맞춘다. */
  async function subscribe(quiet = false) {
    if (!vapidPublicKey) return
    setAsk(false); if (!quiet) setStatus('working')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription() ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(vapidPublicKey) })
      // 시간대도 함께 보낸다 — 캐릭터의 활동 시간을 사용자 현지 시각으로 보는데, 시간대를 고르는 설정은 없다.
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
      setStatus(res.ok ? 'subscribed' : 'prompt'); if (res.ok && !quiet) toast('이제 먼저 연락이 올 수 있어요.', 'relationship')
    } catch { setStatus(Notification.permission === 'denied' ? 'denied' : 'prompt') }
  }

  // 확인 중이거나, 미구성(개발·E2E)·미지원 브라우저라 사용자가 할 일이 없으면 대화 화면에 그리지 않는다.
  if (status === 'checking' || status === 'unsupported' || status === 'unconfigured' || status === 'subscribed') return null
  const text: Record<Exclude<Status, 'checking' | 'unsupported' | 'unconfigured' | 'subscribed'>, string> = {
    ios_install: `iPhone에서는 공유 → 홈 화면에 추가한 뒤 알림을 켜야 ${name}의 연락을 받을 수 있어요.`,
    prompt: `앱을 닫아도 ${name}의 연락을 받으려면`,
    denied: '알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.',
    working: '확인 중…',
  }
  return (
    <>
      {/* 입력창 위 한 줄 — 미디어 버튼 줄과 같은 여백. 안 바뀌는 안내라 live region 이 아니다(대화방의 '입력 중' 상태와 겹치지 않게). */}
      <div data-push-prompt style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 var(--space-4) 8px' }}>
        <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{text[status]}</span>
        {status === 'prompt' && <Button size="sm" variant="secondary" type="button" onClick={() => setAsk(true)}>알림 켜기</Button>}
      </div>
      <Modal open={ask} onClose={() => setAsk(false)} title="먼저 연락이 올 수 있게">
        <p className="t-body" style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>{withParticle(name, '은', '는')} 자기 사정과 관계에 따라 가끔 먼저 연락해요. 앱을 닫아 두어도 알림으로 받을 수 있어요.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={() => setAsk(false)}>나중에</Button>
          <Button variant="primary" type="button" onClick={() => subscribe()} status={status === 'working' ? 'loading' : 'idle'} disabled={status === 'working'}>허용</Button>
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
