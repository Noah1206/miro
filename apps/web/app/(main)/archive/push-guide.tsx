'use client'
import { useEffect, useState } from 'react'
import { settingsPath, subscribeToPush } from '@/components/push-subscribe'
import { useT } from '@/lib/i18n/client'

type State = 'hidden' | 'ask' | 'denied' | 'install'

/** 11/7 사용자: 알림을 안 켠 사람에게 알림(대화 목록) 페이지 위에서 켜는 길을 바로 알려 준다. 켜져 있으면 아무것도 없다. */
export function PushGuide({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useT()
  const [state, setState] = useState<State>('hidden')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!vapidPublicKey || !('serviceWorker' in navigator)) return
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!('Notification' in window) || !('PushManager' in window)) { if (ios && !standalone) setState('install'); return }
    if (Notification.permission === 'denied') { setState('denied'); return }
    if (Notification.permission === 'default') { setState('ask'); return }
    void navigator.serviceWorker.getRegistration('/sw.js').then(reg => reg?.pushManager.getSubscription()).then(sub => { if (!sub) setState('ask') }).catch(() => {})
  }, [vapidPublicKey])
  if (state === 'hidden') return null
  const line = state === 'denied' ? t(settingsPath())
    : state === 'install' ? t('iPhone은 공유 → 홈 화면에 추가 → 홈 화면의 MIRO로 열어야 알림을 받을 수 있어요.')
    : t('앱을 닫아 두어도 캐릭터의 연락을 알림으로 받아요.')
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: '12px 14px', borderRadius: 14, border: '1px solid #ffffff1a', background: 'var(--color-surface-2)' }}>
      <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', color: 'var(--color-accent-text)' }}>
        <path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5" /><path d="M10.2 20.5a2 2 0 0 0 3.6 0" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>{t('알림이 꺼져 있어요')}</p>
        <p className="t-caption" style={{ margin: '2px 0 0', color: 'var(--color-text-secondary)' }}>{line}</p>
      </div>
      {state === 'ask' && <button type="button" disabled={busy} onClick={async () => {
        setBusy(true)
        try {
          const permission = await Notification.requestPermission()
          if (permission === 'granted' && vapidPublicKey && await subscribeToPush(vapidPublicKey)) setState('hidden')
          else if (permission === 'denied') setState('denied')
        } finally { setBusy(false) }
      }} style={{ flex: 'none', height: 32, padding: '0 14px', border: 0, borderRadius: 999, background: 'var(--color-accent)', color: 'var(--color-accent-on)', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('알림 켜기')}</button>}
    </div>
  )
}
