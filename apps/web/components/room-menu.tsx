'use client'
import { useEffect, useId, useState, type ReactNode } from 'react'
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
import { Drawer } from '@/components/ui/drawer'
import { TransitionLink } from '@/components/ui/transition-link'
import { useWallet } from '@/components/wallet/provider'
import { INTL_LOCALE } from '@/lib/i18n'
import { useLanguage, useT } from '@/lib/i18n/client'
import { ChatModelOptions } from '@/app/(main)/chat/[sessionId]/model-picker'
import { MemoryGraphView } from '@/app/(main)/chat/[sessionId]/memory-graph'
import { useImmersive } from '@/app/(main)/chat/[sessionId]/immersive'
import { RoomVoicePanel, type RoomVoice } from '@/components/room-voice'
import { RoomGallery } from '@/components/room-gallery'
import { ReplyLengthSheet } from '@/components/reply-length-sheet'
import styles from './room-menu.module.css'
import sheetStyles from './push-subscribe.module.css'

type Panel = 'persona' | 'theme' | 'model' | 'memory' | 'note'
type IconName = Panel | 'length' | 'message' | 'archive' | 'character' | 'settings' | 'download' | 'exit'
function MenuIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    persona: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
    theme: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><path d="M7 10h.01M10 6.5h.01M15 7h.01M18 10h.01" strokeWidth="3"/></>,
    model: <><rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 3v4M8 12v3M16 12v3M1 12h3M20 12h3"/></>,
    memory: <><path d="M8 4h8l4 4v12H4V4h4M15 4v5h5M8 13h8M8 17h5"/></>,
    note: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></>,
    length: <><path d="M4 6h16M4 10h12M4 14h16M4 18h9"/></>,
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
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [lengthOpen, setLengthOpen] = useState(false)
  const { request } = useRoomControls()
  useEffect(() => {
    if (!request) return
    setPanel(request.panel); setOpen(true)
    void refreshProfile(); void refreshBalance()
  }, [request, refreshProfile, refreshBalance])
  // 11/21 사용자: 첫 안내(코치마크)가 목소리 고르기를 짚을 때 메뉴를 열고, 안내가 끝나면 닫는다.
  useEffect(() => {
    const show = () => { setPanel(null); setOpen(true) }
    const hide = () => setOpen(false)
    window.addEventListener('miro:coach-open-menu', show); window.addEventListener('miro:coach-close-menu', hide)
    return () => { window.removeEventListener('miro:coach-open-menu', show); window.removeEventListener('miro:coach-close-menu', hide) }
  }, [])
  const close = () => setOpen(false)
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
    <button type="button" className={styles.trigger} aria-label={t('대화 메뉴')} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => { setPanel(null); setOpen(true); void refreshProfile(); void refreshBalance() }}>
      <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <Drawer id={menuId} open={open} onClose={close} title={t('채팅방 설정')} footer={row(archiveHref, 'exit', t('대화방 나가기'))}>
      {/* 11/19 사용자: 채팅방 메뉴에서는 갤러리를 뺀다 — 문자방 메뉴에는 그대로. */}
      {messenger && <RoomGallery sessionId={sessionId} open={open}/>}
      <section className={styles.account} aria-label={t('내 프로필')}>
        <TransitionLink href="/my" className={styles.identity} aria-label={t('내 프로필')} onClick={close}><span className={styles.avatar} aria-hidden="true">{profile.avatarUrl ? <CharacterPhoto key={profile.avatarUrl} src={profile.avatarUrl} alt="" size="avatar" width={38} height={38} sizes="38px"/> : <span className="avatar-default"><LogoMark size={20} label=""/></span>}</span><span className={styles.identityText}><strong>{profile.name}</strong></span></TransitionLink>
        <div className={styles.wallet} aria-label={t('보유 토큰')}>
          <p className={styles.balance} aria-live="polite"><img src="/miro-token.svg" alt="" aria-hidden="true" width={24} height={24} decoding="async"/><strong data-room-balance={wallet?.available} data-wallet-live={live} data-wallet-observed-at={wallet?.observedAt}>{wallet ? wallet.available.toLocaleString(locale) : '—'}</strong><span className="sr-only">{t('미로 토큰')}</span></p>
          <button type="button" onClick={() => { close(); openRecharge() }}>{t('충전하기')}</button>
        </div>
      </section>
      <section className={styles.section} aria-label={t('내 설정')}>
        <h3>{t('내 설정')}</h3>
        {/* 음성 모드(11/9 사용자: 헤더 대신 메뉴 안) — 켜면 캐릭터 답장을 목소리로 듣는다. 이 탭이 아이폰 소리 잠금도 푼다. */}
        {available && <button type="button" role="switch" aria-checked={on} className={styles.voiceRow} onClick={voiceToggle} data-coach="voice-pick"><span>{t('음성 모드')}</span><i aria-hidden /></button>}
        {/* 11/12 음성 서버가 멈춘 동안: 켤 수 없는 줄로 '곧 열림' 만 알린다. */}
        {!available && soon && <button type="button" disabled className={styles.voiceRow}><span>{t('음성 모드')}</span><em>{t('곧 열림')}</em></button>}
        {/* 11/10: 목소리 고르기는 타일 대신 음성 모드를 켰을 때 토글 바로 아래 — 캐릭터별 목록 */}
        {available && on && roomVoice && <RoomVoicePanel sessionId={sessionId} voice={roomVoice}/>}
        {/* 11/17 대화 기억은 서랍 안 패널 대신 따로 된 페이지로 — 기억과 캐릭터가 생각하는 나를 크게 본다. */}
        <div className={styles.grid}>{tiles.map(id => id === 'memory' || id === 'note' ? <TransitionLink key={id} href={`/chat/${sessionId}/${id}`} className={styles.tile} onClick={close}>
          <MenuIcon name={id}/><span>{titles[id]}</span>
        </TransitionLink> : <button key={id} id={`${menuId}-${id}`} type="button" className={styles.tile} aria-expanded={panel === id} aria-controls={panel === id ? `${menuId}-detail` : undefined} onClick={() => setPanel(panel === id ? null : id)}>
          <MenuIcon name={id}/><span>{titles[id]}</span>
        </button>)}
          {/* 11/10 출력량 설정 — 서랍 대신 팝업(크랙·베이비챗 참고). 모델 선택과 같은 저장소를 쓴다. */}
          {choices.length > 0 && <button type="button" className={styles.tile} aria-haspopup="dialog" onClick={() => { close(); setLengthOpen(true) }}><MenuIcon name="length"/><span>{t('출력량 설정')}</span></button>}
        </div>
        {panel && <div id={`${menuId}-detail`} role="region" aria-labelledby={`${menuId}-${panel}`} className={styles.detail}>
          <div className={styles.detailHead}><strong>{titles[panel]}</strong><button type="button" aria-label={t('상세 설정 닫기')} onClick={() => { document.getElementById(`${menuId}-${panel}`)?.focus(); setPanel(null) }}>×</button></div>
          {panel === 'persona' && <ConversationPersona inline sessionId={sessionId} initial={initialPersona} characterName={characterName} entry={entry}/>}
          {panel === 'memory' && <MemoryGraphView sessionId={sessionId} refreshKey={turnCount}/>}
          {panel === 'model' && <ChatModelOptions choices={choices}/>}
        </div>}
      </section>
      <section className={`${styles.section} ${styles.actions} ${styles.management}`} aria-label={t('대화 관리')}>
        {messengerHref && row(messengerHref, 'message', t('메시지 창으로 이동'))}
        {characterHref && row(characterHref, 'character', t('캐릭터 정보'))}
        {row(archiveHref, 'archive', t('이전 대화 보기'))}
        {row(`/chat/${sessionId}/novel`, 'download', t('웹소설로 만들기'))}
        {/* 11/16 대화 원문 TXT — 파일 내려받기라 화면 전환 링크가 아니라 일반 링크. */}
        <a href={`/api/chat-export/${sessionId}`} download className={styles.row} onClick={close}><MenuIcon name="download"/><span>{t('대화 내려받기 (TXT)')}</span><Chevron/></a>
      </section>
      <section className={`${styles.section} ${styles.actions}`} aria-label={t('환경')}>
        {row('/my/permissions', 'settings', t('알림·접근 권한'))}
        <InstallAppButton className={styles.row} onOpen={close}><MenuIcon name="download"/><span>{t('홈 화면에 추가')}</span><Chevron/></InstallAppButton>
      </section>
    </Drawer>
    <ReplyLengthSheet open={lengthOpen} onClose={() => setLengthOpen(false)} choices={choices}/>
  </>
}
