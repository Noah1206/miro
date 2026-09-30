'use client'
import { useEffect, useRef, useState } from 'react'
import { Button, Sheet, useToast } from '@/components/ui'
import { SHEET_BUTTON } from '@/app/(main)/recharge/transfer-actions'
import styles from './push-subscribe.module.css'
import { markPushPromptDone, pushPromptDone, WELCOME_PARAM } from '@/lib/onboarding-options'
import { msg } from '@/lib/i18n'
import { useT } from '@/lib/i18n/client'

type Status = 'checking' | 'unsupported' | 'ios_install' | 'unconfigured' | 'prompt' | 'subscribed' | 'denied' | 'working'

/**
 * 캐릭터가 앱 밖에서 먼저 연락할 수 있게. 미로 캐릭터 대화방에 붙는다.
 * 앱 밖 연락을 끄는 설정은 없다 (2026-09-24 결정) — 남은 건 브라우저 권한뿐이라, 구독될 때까지 여기서 묻는다.
 * 이미 허용된 기기는 묻지 않고 구독을 서버와 다시 맞춘다(다른 계정으로 바뀌었거나 서버가 실패로 표시한 경우).
 * iOS Safari 는 홈 화면에 추가된 PWA 에서만 Push 를 허용한다.
 */
/** 한 브라우저 세션에 한 번만 먼저 묻는다 — '나중에' 를 누른 사람에게 화면마다 다시 묻지 않는다. */
const ASKED_KEY = 'miro:push-asked'
function askedThisSession(): boolean {
  try { return sessionStorage.getItem(ASKED_KEY) === '1' } catch { return false }
}
function markAsked() { try { sessionStorage.setItem(ASKED_KEY, '1') } catch {} }

/**
 * autoPrompt: 로그인한 사용자가 들어오면 화면 어디서든 바로 팝업으로 묻는다(2026-09-29 결정). 이때는 줄을 그리지 않고
 * 팝업만 띄우며, iPhone 미설치·차단 상태도 한 번은 알려 준다.
 */
export function PushSubscribe({ vapidPublicKey, name, autoPrompt = false }: { vapidPublicKey: string | null; name: string; autoPrompt?: boolean }) {
  const [status, setStatus] = useState<Status>('checking')
  const [ask, setAsk] = useState(false)
  const [guide, setGuide] = useState(false)
  const toast = useToast()
  const t = useT()
  // 먼저 묻기. 가입 직후라면 가입 선물 팝업이 이것이 끝나기를 기다린다(markPushPromptDone) — 보여 주고 닫았거나, 물을 게 없었을 때.
  // 가입 직후(?welcome=1)에는 알림 시트를 반드시 먼저 보인다(2026-09-30 요청) — 이 탭에서 이미 물었어도, 알림이 이미 켜져 있어도
  // ('켜져 있어요' 시트). 가입 선물 팝업은 이 시트가 끝난 뒤에 뜬다. 주소는 화면이 붙은 뒤에 읽는다 — 온보딩에서 넘어오는 순간의
  // 첫 렌더에는 아직 이전 주소(/onboarding)라서 가입 직후인지 놓쳤다(9/30).
  const [welcome, setWelcome] = useState(false)
  useEffect(() => { setWelcome(new URLSearchParams(window.location.search).has(WELCOME_PARAM)) }, [])
  const shown = useRef(false)
  useEffect(() => {
    if (!autoPrompt || status === 'working') return
    // 확인이 오래 걸리면(서비스 워커가 안 뜨는 등) 뒤의 팝업을 붙잡아 두지 않는다.
    if (status === 'checking') { const timer = setTimeout(markPushPromptDone, 8000); return () => clearTimeout(timer) }
    // 이미 한 번 보였거나(허용 뒤 상태가 바뀐 경우) 팝업이 먼저 떠 버렸으면 시트를 다시 띄우지 않는다 — 겹치지 않게.
    if (shown.current || pushPromptDone()) { markPushPromptDone(); return }
    const asks = status === 'prompt' || status === 'ios_install' || status === 'denied' || (welcome && status === 'subscribed')
    if (!asks || (!welcome && askedThisSession())) { markPushPromptDone(); return }
    // 화면이 먼저 그려진 뒤 올라오게 잠깐 기다린다 — 들어오자마자 덮으면 무엇 위에 뜬 건지 알 수 없다.
    const timer = setTimeout(() => { shown.current = true; markAsked(); if (status === 'prompt') setAsk(true); else setGuide(true) }, 700)
    return () => clearTimeout(timer)
  }, [autoPrompt, status, welcome])

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
      setStatus(res.ok ? 'subscribed' : 'prompt'); if (res.ok && !quiet) toast(t('이제 먼저 연락이 올 수 있어요.'), 'relationship')
    } catch { setStatus(Notification.permission === 'denied' ? 'denied' : 'prompt') }
  }

  // 확인 중이거나, 미구성(개발·E2E)·미지원 브라우저라 사용자가 할 일이 없으면 대화 화면에 그리지 않는다.
  if (autoPrompt) return (
    <>
      <PushSheet kind="ask" open={ask} onClose={() => { setAsk(false); markPushPromptDone() }} name={name} working={status === 'working'} onAllow={() => subscribe()} />
      <PushSheet kind={status === 'ios_install' ? 'ios_install' : status === 'subscribed' ? 'on' : 'denied'} open={guide} onClose={() => { setGuide(false); markPushPromptDone() }} name={name} />
    </>
  )
  if (status === 'checking' || status === 'unsupported' || status === 'unconfigured' || status === 'subscribed') return null
  const text: Record<Exclude<Status, 'checking' | 'unsupported' | 'unconfigured' | 'subscribed'>, string> = {
    ios_install: t('iPhone에서는 공유 → 홈 화면에 추가한 뒤 알림을 켜야 {name}의 연락을 받을 수 있어요.', { name }),
    prompt: t('앱을 닫아도 {name}의 연락을 받으려면', { name }),
    denied: t('알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.'),
    working: t('확인 중…'),
  }
  return (
    <>
      {/* 입력창 위 한 줄 — 미디어 버튼 줄과 같은 여백. 안 바뀌는 안내라 live region 이 아니다(대화방의 '입력 중' 상태와 겹치지 않게). */}
      <div data-push-prompt style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 var(--space-4) 8px' }}>
        <span className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{text[status]}</span>
        {status === 'prompt' && <Button size="sm" variant="secondary" type="button" onClick={() => setAsk(true)}>{t('알림 켜기')}</Button>}
      </div>
      <PushSheet kind="ask" open={ask} onClose={() => setAsk(false)} name={name} working={status === 'working'} onAllow={() => subscribe()} />
    </>
  )
}

const COPY = {
  ask: { title: msg('먼저 연락이 올 수 있게'), line: msg('앱을 닫아 두어도 {name}의 연락을 알림으로 받아요.') },
  denied: { title: msg('알림이 꺼져 있어요'), line: msg('브라우저 설정에서 이 사이트의 알림을 허용해 주세요.') },
  ios_install: { title: msg('홈 화면에 추가해 주세요'), line: msg('iPhone은 공유 → 홈 화면에 추가 → 홈 화면의 MIRO로 열어야 알림을 받을 수 있어요.') },
  on: { title: msg('알림이 켜져 있어요'), line: msg('캐릭터가 먼저 연락하면 알림으로 알려 드려요.') },
} as const

/** 지갑 시트와 같은 모양: 가운데 아이콘·제목·한 줄, 아래 어두운 버튼과 작은 '나중에'. */
function PushSheet({ kind, open, onClose, name, working = false, onAllow }: {
  kind: keyof typeof COPY; open: boolean; onClose: () => void; name: string; working?: boolean; onAllow?: () => void
}) {
  const copy = COPY[kind]
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} label={t(copy.title)}>
      <div className={styles.stack} data-push-sheet={kind}>
        <div className={styles.center}>
          <svg className={styles.icon} aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 10a6 6 0 1 1 12 0c0 4.5 1.3 6.2 2 7H4c.7-.8 2-2.5 2-7Z" /><path d="M10 20a2 2 0 0 0 4 0" />
            {kind === 'denied' && <path d="M4 3l16 18" />}
          </svg>
          {/* 첫 초점은 제목에 — 닫기 버튼에 주면 열리자마자 초점 테두리가 그려진다. 스크린 리더는 제목부터 읽는다. */}
          <h2 className="t-title-2" tabIndex={-1} data-initial-focus>{t(copy.title)}</h2>
          <p>{t(copy.line, { name })}</p>
        </div>
        <div className={styles.actions}>
          {onAllow ? <>
            <Button variant="secondary" full style={SHEET_BUTTON} onClick={onAllow} status={working ? 'loading' : 'idle'} disabled={working}>{t('알림 받기')}</Button>
            <Button variant="ghost" size="sm" full onClick={onClose} style={{ color: 'var(--color-text-primary)' }}>{t('나중에')}</Button>
          </> : <Button variant="secondary" full style={SHEET_BUTTON} onClick={onClose}>{t('확인')}</Button>}
        </div>
      </div>
    </Sheet>
  )
}
function toUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded); const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
