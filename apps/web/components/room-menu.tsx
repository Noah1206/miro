'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { useRoomControls } from '@/components/room-controls'
import type { UserPersona } from '@miro/domain'
import type { CharacterEntry } from '@/lib/character-entry'
import type { AccountProfile } from '@/lib/account-profile'
import { useAccountProfile } from '@/components/account-profile-provider'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import { Button, LogoMark, Sheet, useToast } from '@/components/ui'
import { CharacterPhoto } from '@/components/character-visual'
import { ConversationPersona } from '@/components/conversation-persona'
import { InstallAppButton } from '@/components/pwa-install'
import { TransitionLink } from '@/components/ui/transition-link'
import { useWallet } from '@/components/wallet/provider'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { ChatModelOptions } from '@/app/(main)/chat/[sessionId]/model-picker'
import { useImmersive } from '@/app/(main)/chat/[sessionId]/immersive'
import { RoomVoicePanel, type RoomVoice } from '@/components/room-voice'
import { RoomGallery } from '@/components/room-gallery'
import { ReplyLengthPanel } from '@/components/reply-length-sheet'
import { PacePanel } from '@/components/chat-pace'
import { DisplayPanel } from '@/components/chat-display'
import styles from './room-menu.module.css'
import sheetStyles from './push-subscribe.module.css'

type Panel = 'persona' | 'theme' | 'model' | 'memory' | 'note'
type IconName = Panel | 'length' | 'pace' | 'display' | 'message' | 'archive' | 'character' | 'settings' | 'download' | 'exit'
function MenuIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    persona: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
    theme: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><path d="M7 10h.01M10 6.5h.01M15 7h.01M18 10h.01" strokeWidth="3"/></>,
    model: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M8 12v3M16 12v3M1 12h3M20 12h3"/></>,
    memory: <><path d="M8 4h8l4 4v12H4V4h4M15 4v5h5M8 13h8M8 17h5"/></>,
    note: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></>,
    length: <><path d="M4 6h16M4 10h12M4 14h16M4 18h9"/></>,
    pace: <><path d="m5 6 6 6-6 6"/><path d="m13 6 6 6-6 6"/></>,
    display: <><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></>,
    message: <path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-6a8 8 0 0 1 0-10A8 8 0 0 1 9 3h4a8 8 0 0 1 8 8Z"/>,
    archive: <><path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/></>,
    character: <><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="9" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></>,
    settings: <><path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M9 15v6"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    exit: <><path d="M9 4h11v16H9M13 12H2m4-4-4 4 4 4"/></>,
  }
  return <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
function Chevron() { return <svg aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m9 5 7 7-7 7"/></svg> }

type Screen = 'main' | 'persona' | 'model' | 'length' | 'pace' | 'display'
const SCREENS = new Set<string>(['main', 'persona', 'model', 'length', 'pace', 'display'])

/**
 * 11/21 사용자: ☰ 를 누르면 서랍 대신 화면 전체가 '채팅방 설정' 페이지로 — 머리의 < 로 바로 채팅방으로 돌아온다.
 * 페르소나·AI 모델·출력량도 각자 따로 된 페이지(같은 방법). 주소에 ?menu=… 를 남겨 브라우저 뒤로 가기도 같은 순서로 돌아간다
 * (주소만 바꾸고 서버를 다시 부르지 않는다 — history.pushState). 대화방의 상태(음성·모델 고르기)를 그대로 쓰려고 대화방 안에서 그린다.
 */
function useRoomScreen() {
  const v = useSearchParams().get('menu')
  // 서버에서 그릴 땐 열지 않는다(페이지는 body 에 그린다) — 새로고침으로 ?menu 가 남아 있어도 화면이 살아난 뒤에 연다.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const screen = mounted && v && SCREENS.has(v) ? v as Screen : null
  const pushed = useRef(0)
  const go = (next: Screen) => { const u = new URL(window.location.href); u.searchParams.set('menu', next); window.history.pushState(null, '', u); pushed.current++ }
  // 이 화면에서 연 페이지면 한 칸 뒤로, 주소로 바로 들어온 경우(새로고침)는 메뉴 표시만 지운다.
  const back = () => {
    if (pushed.current > 0) { pushed.current--; window.history.back(); return }
    const u = new URL(window.location.href); u.searchParams.delete('menu'); window.history.replaceState(null, '', u)
  }
  return { screen, go, back }
}

function RoomPage({ title, onBack, children, footer, action }: { title: string; onBack: () => void; children: ReactNode; footer?: ReactNode; /** 머리 오른쪽(예: 저장). */ action?: ReactNode }) {
  const t = useT()
  // 머리가 숨을 때 움직이는(transform) 조상 밖으로 — 화면 전체를 덮게 body 에 그린다(같은 React 트리라 대화방 상태는 그대로).
  return createPortal(<div className={styles.page} role="dialog" aria-modal="true" aria-label={title}>
    <header className={styles.pageHead}>
      <button type="button" className={`${styles.pageBack} back-press`} aria-label={t('뒤로')} onClick={onBack}>
        <svg aria-hidden width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <h2>{title}</h2>
      <span className={styles.pageAction}>{action}</span>
    </header>
    <div className={styles.pageBody}>{children}</div>
    {footer && <div className={styles.pageFoot}>{footer}</div>}
  </div>, document.body)
}

/** Existing room controls share one drawer; detail panels expand in place. */
export function RoomMenu({ sessionId, initialPersona, characterName, profile: initialProfile, entry, portrait, messengerHref, characterHref, choices = [], turnCount = 0, messenger = false, roomVoice }: {
  sessionId: string; initialPersona: UserPersona | null; characterName: string
  profile: AccountProfile
  entry?: CharacterEntry | null; portrait?: string | null; messengerHref?: string; characterHref?: string
  choices?: ChatModelChoice[]; turnCount?: number; messenger?: boolean; roomVoice?: RoomVoice
}) {
  const t = useT()
  const { profile, refresh: refreshProfile } = useAccountProfile(initialProfile)
  const locale = INTL_LOCALE[useLanguage()]
  const { available, soon, on, toggle } = useImmersive()
  const toast = useToast()
  const { wallet, openRecharge, refreshBalance, live } = useWallet()
  const { screen, go, back } = useRoomScreen()
  const open = screen !== null
  const { request } = useRoomControls()
  const goRef = useRef(go); goRef.current = go
  useEffect(() => {
    if (!request) return
    goRef.current('main'); if (request.panel === 'persona' || request.panel === 'model') goRef.current(request.panel)
    void refreshProfile(); void refreshBalance()
  }, [request, refreshProfile, refreshBalance])
  // 11/21 사용자: 첫 안내(코치마크)가 목소리 고르기를 짚을 때 설정 페이지를 열고, 안내가 끝나면 닫는다.
  const openRef = useRef(open); openRef.current = open
  const backRef = useRef(back); backRef.current = back
  useEffect(() => {
    const show = () => { if (!openRef.current) goRef.current('main') }
    const hide = () => { if (openRef.current) backRef.current() }
    window.addEventListener('miro:coach-open-menu', show); window.addEventListener('miro:coach-close-menu', hide)
    return () => { window.removeEventListener('miro:coach-open-menu', show); window.removeEventListener('miro:coach-close-menu', hide) }
  }, [])
  // 다른 페이지로 넘어가는 링크는 그대로 이동(설정 페이지 표시는 대화방 주소에 남아 뒤로 오면 다시 보인다).
  const close = () => {}
  const titles: Record<Panel, string> = { persona: t('페르소나'), model: t('AI 모델'), theme: t('채팅방 테마'), memory: t('기억 노트'), note: t('유저노트') }
  const tiles: Panel[] = ['persona', 'model', 'memory', 'note']   // 11/19 사용자: 채팅방 테마 고르기 삭제(늘 기본 테마)
  const archiveHref = messenger ? '/archive?channel=dm' : '/archive'
  const row = (href: string, icon: IconName, label: string) => <TransitionLink href={href} className={styles.row} onClick={close}><MenuIcon name={icon}/><span>{label}</span><Chevron/></TransitionLink>
  // 11/19 사용자: 이 계정에서 음성 모드를 처음 켜면 토스트 대신 안내 시트(무엇이 되는지·비용·끄는 곳). 두 번째부터는 토스트.
  const [voiceIntro, setVoiceIntro] = useState(false)
  const voiceToggle = () => {
    if (!on) {
      const key = `miro:voice-intro:${profile.userId}`
      let seen = true
      try { seen = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1') } catch { /* 저장소를 막은 브라우저 — 토스트로 */ }
      if (seen) toast(t('음성 모드가 켜졌어요. 읽는 대사 100자마다 10토큰이 더 들어요'))
      else setVoiceIntro(true)
    }
    toggle()
  }
  return <>
    <Sheet open={voiceIntro} onClose={() => setVoiceIntro(false)} label={t('음성 모드가 켜졌어요')} compact>
      <div className={sheetStyles.stack}>
        <div className={sheetStyles.center}>
          <svg className={sheetStyles.icon} aria-hidden="true" viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r="32" fill="#111"/>
            <g transform="translate(14 14) scale(1.5)" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.2 5.3 7.4 8.6H5.2a1.7 1.7 0 0 0-1.7 1.7v3.4a1.7 1.7 0 0 0 1.7 1.7h2.2l3.8 3.3a.7.7 0 0 0 1.15-.53V5.83a.7.7 0 0 0-1.15-.53Z" fill="#fff" stroke="none"/>
              <path d="M15.7 9.3a3.8 3.8 0 0 1 0 5.4M18.4 6.8a7.4 7.4 0 0 1 0 10.4"/>
            </g>
          </svg>
          <h2 className="t-title-2" tabIndex={-1} data-initial-focus>{t('음성 모드가 켜졌어요')}</h2>
          <p>{t('이제 캐릭터가 대사를 목소리로 읽어 줘요. 읽는 대사 100자마다 10토큰이 더 들고, 헤더의 스위치로 언제든 끌 수 있어요.')}</p>
        </div>
        <div className={sheetStyles.actions}>
          <Button variant="primary" full pressScale={0.94} onClick={() => setVoiceIntro(false)}
            style={{ background: 'var(--color-lavender-600)', border: '1px solid var(--color-lavender-600)', color: 'var(--color-white)', fontWeight: 'var(--weight-regular)', borderRadius: 'var(--radius-lg)' }}>{t('좋아요')}</Button>
          <Button variant="ghost" size="sm" full onClick={() => { setVoiceIntro(false); if (on) toggle() }} style={{ color: 'var(--color-text-primary)' }}>{t('다시 끄기')}</Button>
        </div>
      </div>
    </Sheet>
    {/* 11/16 사용자: 헤더에서도 음성 모드를 켠다 — 메뉴 버튼과 같은 크기의 스피커 아이콘, 켜면 라벤더색에 소리 물결. */}
    {available && <button type="button" role="switch" aria-checked={on} aria-label={t('음성 모드')} title={t('음성 모드')} className={styles.voiceSwitch} onClick={voiceToggle} data-coach="voice">
      {/* 11/19 사용자(레퍼런스): 음성 버튼 = 알약 스위치 — 꺼짐은 어두운 바탕·흰 손잡이 왼쪽(꺼진 스피커), 켜짐은 흰 바탕·검은 손잡이 오른쪽(물결). */}
      <span className={styles.voiceKnob} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11.2 5.3 7.4 8.6H5.2a1.7 1.7 0 0 0-1.7 1.7v3.4a1.7 1.7 0 0 0 1.7 1.7h2.2l3.8 3.3a.7.7 0 0 0 1.15-.53V5.83a.7.7 0 0 0-1.15-.53Z" fill="currentColor" stroke="none"/>
          <g className={styles.voiceWaves}><path d="M15.7 9.3a3.8 3.8 0 0 1 0 5.4"/><path d="M18.4 6.8a7.4 7.4 0 0 1 0 10.4"/></g>
          <g className={styles.voiceMute}><path d="m16.5 9.8 4.2 4.4M20.7 9.8l-4.2 4.4"/></g>
        </svg>
      </span>
    </button>}
    <button type="button" className={styles.trigger} aria-label={t('대화 메뉴')} onClick={() => { go('main'); void refreshProfile(); void refreshBalance() }}>
      <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    {screen === 'persona' && <RoomPage title={titles.persona} onBack={back} action={<button type="submit" form="room-persona-form" className={styles.pageSave}>{t('저장')}</button>}><ConversationPersona inline formId="room-persona-form" sessionId={sessionId} initial={initialPersona} characterName={characterName} entry={entry}/></RoomPage>}
    {screen === 'model' && <RoomPage title={titles.model} onBack={back}><ChatModelOptions choices={choices}/></RoomPage>}
    {screen === 'length' && <RoomPage title={t('출력량 설정')} onBack={back}><ReplyLengthPanel open onClose={back} choices={choices}/></RoomPage>}
    {screen === 'pace' && <RoomPage title={t('전개 설정')} onBack={back}><PacePanel onClose={back}/></RoomPage>}
    {screen === 'display' && <RoomPage title={t('화면 설정')} onBack={back}><DisplayPanel onClose={back}/></RoomPage>}
    {screen === 'main' && <RoomPage title={t('채팅방 설정')} onBack={back} footer={row(archiveHref, 'exit', t('대화방 나가기'))}>
      {/* 11/19 사용자: 채팅방 메뉴에서는 갤러리를 뺀다 — 문자방 메뉴에는 그대로. */}
      {messenger && <RoomGallery sessionId={sessionId} open={open}/>}
      <section className={styles.account} aria-label={t('내 프로필')}>
        <TransitionLink href="/my" className={styles.identity} aria-label={t('내 프로필')} onClick={close}><span className={styles.avatar} aria-hidden="true">{profile.avatarUrl ? <CharacterPhoto key={profile.avatarUrl} src={profile.avatarUrl} alt="" size="avatar" width={38} height={38} sizes="38px"/> : <span className="avatar-default"><LogoMark size={20} label=""/></span>}</span><span className={styles.identityText}><strong>{profile.name}</strong></span></TransitionLink>
        <div className={styles.wallet} aria-label={t('보유 토큰')}>
          <p className={styles.balance} aria-live="polite"><img src="/miro-token.svg" alt="" aria-hidden="true" width={24} height={24} decoding="async"/><strong data-room-balance={wallet?.available} data-wallet-live={live} data-wallet-observed-at={wallet?.observedAt}>{wallet ? wallet.available.toLocaleString(locale) : '—'}</strong><span className="sr-only">{t('미로 토큰')}</span></p>
          <button type="button" onClick={() => { back(); openRecharge() }}>{t('충전하기')}</button>
        </div>
      </section>
      {/* 11/21 사용자: 음성 모드는 따로 된 칸 — 켜면 바로 아래 캐릭터별 목소리 고르기. 이 탭이 아이폰 소리 잠금도 푼다. */}
      {(available || soon) && <section className={styles.section} aria-label={t('음성 모드')}>
        <h3>{t('음성')}</h3>
        {available && <button type="button" role="switch" aria-checked={on} className={styles.voiceRow} onClick={voiceToggle} data-coach="voice-pick"><span>{t('음성 모드')}</span><i aria-hidden /></button>}
        {/* 11/12 음성 서버가 멈춘 동안: 켤 수 없는 줄로 '곧 열림' 만 알린다. */}
        {!available && soon && <button type="button" disabled className={styles.voiceRow}><span>{t('음성 모드')}</span><em>{t('곧 열림')}</em></button>}
        {available && on && roomVoice && <RoomVoicePanel sessionId={sessionId} voice={roomVoice}/>}
      </section>}
      {/* 11/21 사용자: 두 줄 칸(타일) 대신 모두 한 줄 — 페르소나·AI 모델·출력량은 따로 된 페이지, 기억 노트·유저노트는 각 페이지로. */}
      <section className={`${styles.section} ${styles.actions}`} aria-label={t('내 설정')}>
        <h3>{t('내 설정')}</h3>
        {tiles.map(id => id === 'memory' || id === 'note'
          ? <TransitionLink key={id} href={`/chat/${sessionId}/${id}`} className={styles.row} onClick={close}><MenuIcon name={id}/><span>{titles[id]}</span><Chevron/></TransitionLink>
          : <button key={id} type="button" className={styles.row} onClick={() => go(id as Screen)}><MenuIcon name={id}/><span>{titles[id]}</span><Chevron/></button>)}
        {choices.length > 0 && <button type="button" className={styles.row} onClick={() => go('length')}><MenuIcon name="length"/><span>{t('출력량 설정')}</span><Chevron/></button>}
        {/* 11/24 사용자: 전개 설정 — 누가 이야기를 끌고 갈지·늘어지는 시간 건너뛰기 */}
        <button type="button" className={styles.row} onClick={() => go('pace')}><MenuIcon name="pace"/><span>{t('전개 설정')}</span><Chevron/></button>
        {/* 11/24 사용자: 화면 설정 — 글자 크기·글씨체·사진 크기·대화창 넓이(이 기기에만) */}
        <button type="button" className={styles.row} onClick={() => go('display')}><MenuIcon name="display"/><span>{t('화면 설정')}</span><Chevron/></button>
      </section>
      {/* 11/21 사용자: 캐릭터 정보·이전 대화 보기·대화 내려받기·알림·접근 권한 줄은 지웠다. */}
      <section className={`${styles.section} ${styles.actions} ${styles.management}`} aria-label={t('대화 관리')}>
        {messengerHref && row(messengerHref, 'message', t('메시지 창으로 이동'))}
        {row(`/chat/${sessionId}/novel`, 'download', t('웹소설로 만들기'))}
      </section>
      <section className={`${styles.section} ${styles.actions}`} aria-label={t('환경')}>
        <InstallAppButton className={styles.row} onOpen={back}><MenuIcon name="download"/><span>{t('홈 화면에 추가')}</span><Chevron/></InstallAppButton>
      </section>
    </RoomPage>}
  </>
}
