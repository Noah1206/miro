'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Sheet } from './ui/sheet'
import { useT } from '@/lib/i18n/client'
import { embeddedBrowser, installPlatform, standaloneDisplay, type InstallPlatform } from '@/lib/pwa'
import styles from './pwa-install.module.css'

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
type InstallState = { ready: boolean; installed: boolean; open: () => void }
const Context = createContext<InstallState>({ ready: false, installed: false, open: () => {} })
const DISMISSED = 'miro:install-hint-dismissed-at'
const WEEK = 7 * 24 * 60 * 60 * 1000

/** Capture browser installation events once, independently of notification permission. */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const [ready, setReady] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [platform, setPlatform] = useState<InstallPlatform>('desktop')
  const [embedded, setEmbedded] = useState(false)
  const [guide, setGuide] = useState(false)
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const prompt = useRef<InstallPrompt | null>(null)
  const prompting = useRef(false)
  useEffect(() => {
    setPlatform(installPlatform(navigator.userAgent, navigator.maxTouchPoints))
    setEmbedded(embeddedBrowser(navigator.userAgent))
    let installedInThisTab = false
    const sync = () => setInstalled(installedInThisTab || standaloneDisplay())
    sync(); setReady(true)
    const media = window.matchMedia('(display-mode: standalone)')
    const capture = (event: Event) => {
      event.preventDefault(); prompt.current = event as InstallPrompt; setAvailable(true)
    }
    const complete = () => { installedInThisTab = true; prompt.current = null; setAvailable(false); setInstalled(true); setGuide(false) }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', complete)
    window.addEventListener('pageshow', sync)
    media.addEventListener('change', sync)
    // The existing worker handles notifications. Registering it does not request permission.
    if (window.isSecureContext && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => { /* Manual home-screen installation remains available. */ })
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', complete)
      window.removeEventListener('pageshow', sync)
      media.removeEventListener('change', sync)
    }
  }, [])
  async function install() {
    const event = prompt.current
    if (!event || prompting.current) return
    prompting.current = true; prompt.current = null; setAvailable(false); setBusy(true); setNotice('')
    try {
      // Must run in this click gesture; browser prompts are single-use.
      await event.prompt()
      const { outcome } = await event.userChoice
      if (outcome === 'accepted') setGuide(false)
      else setNotice(t('언제든 이 메뉴에서 다시 설치 방법을 확인할 수 있어요.'))
    } catch { setNotice(t('브라우저 메뉴에서 홈 화면에 추가를 선택해 주세요.')) }
    finally { prompting.current = false; setBusy(false) }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setNotice(t('주소를 복사했어요. 브라우저에서 열어 주세요.')) }
    catch { setNotice(t('주소창의 주소를 복사해 브라우저에서 열어 주세요.')) }
  }
  return <Context.Provider value={{ ready, installed, open: () => { setNotice(''); setGuide(true) } }}>
    {children}
    <Sheet open={guide} onClose={() => setGuide(false)} title={t('MIRO를 홈 화면에 추가')}>
      <div className={styles.guide}>
        <div className={styles.intro}><img src="/icon-192.png?v=4" alt="" width={52} height={52} /><p>{t('홈 화면에서 바로 열고, 대화를 편하게 이어가세요.')}</p></div>
        {embedded ? <>
          <p>{t('지금은 앱 안의 브라우저예요. 메뉴에서 Safari 또는 Chrome으로 열기를 먼저 선택해 주세요.')}</p>
          <button type="button" className={styles.primary} onClick={() => void copyLink()}>{t('현재 주소 복사')}</button>
        </> : <>
          <ol className={styles.steps}>
            {platform === 'ios' ? <>
              <li>{t('브라우저의 공유 버튼을 눌러 주세요.')}</li>
              <li>{t('홈 화면에 추가를 선택해 주세요. 보이지 않으면 메뉴를 아래로 내려 보세요.')}</li>
              <li>{t('앱으로 열기 옵션이 보이면 켜고, 추가를 눌러 주세요.')}</li>
              <li>{t('홈 화면에 생긴 MIRO 아이콘으로 다시 열어 주세요.')}</li>
            </> : platform === 'android' ? <>
              <li>{t('브라우저 메뉴 ⋮를 눌러 주세요.')}</li>
              <li>{t('앱 설치 또는 홈 화면에 추가를 선택해 주세요.')}</li>
              <li>{t('설치를 확인하고, 홈 화면의 MIRO 아이콘으로 열어 주세요.')}</li>
            </> : <>
              <li>{t('Chrome·Edge에서는 주소창의 설치 아이콘이나 메뉴의 앱 설치를 선택해 주세요.')}</li>
              <li>{t('Mac Safari에서는 파일 메뉴의 Dock에 추가를 선택해 주세요.')}</li>
              <li>{t('추가한 MIRO 아이콘으로 대화를 시작해 주세요.')}</li>
            </>}
          </ol>
          {platform === 'ios' && <p className={styles.hint}>{t('홈 화면에 추가가 없으면 Safari에서 같은 주소를 열어 주세요.')}</p>}
          {(available || busy) && <button type="button" className={styles.primary} disabled={busy} onClick={() => void install()}>{t(busy ? '설치 창을 여는 중…' : 'MIRO 설치하기')}</button>}
        </>}
        {notice && <p role="status" className={styles.hint}>{notice}</p>}
      </div>
    </Sheet>
  </Context.Provider>
}

export function InstallAppButton({ className, children, onOpen }: { className?: string; children?: ReactNode; onOpen?: () => void }) {
  const { ready, installed, open } = useContext(Context)
  const t = useT()
  if (!ready || installed) return null
  return <button type="button" className={className ?? styles.primary} onClick={() => { onOpen?.(); open() }} aria-haspopup="dialog">{children ?? t('홈 화면에 추가')}</button>
}

/** A dismissible invitation on Home; no unsolicited install modal during a conversation. */
export function InstallAppHint() {
  const { ready, installed } = useContext(Context)
  const [dismissed, setDismissed] = useState(true)
  const t = useT()
  useEffect(() => {
    try { const at = Number(localStorage.getItem(DISMISSED) ?? 0); setDismissed(at > 0 && Date.now() - at < WEEK) }
    catch { setDismissed(false) }
  }, [])
  if (!ready || installed || dismissed) return null
  return <aside className={styles.invitation} aria-label={t('MIRO 홈 화면 설치')}>
    <div><strong>{t('MIRO를 앱처럼')}</strong><p>{t('홈 화면에서 바로 대화를 이어가요.')}</p></div>
    <InstallAppButton className={styles.installLink} />
    <button type="button" className={styles.dismiss} aria-label={t('설치 안내 닫기')} onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISSED, String(Date.now())) } catch {} }}>×</button>
  </aside>
}
