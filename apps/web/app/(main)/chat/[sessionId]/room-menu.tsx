'use client'
import { useId, useState } from 'react'
import type { UserPersona } from '@miro/domain'
import type { CharacterEntry } from '@/lib/character-entry'
import { ChatThemeOptions } from '@/components/chat-theme'
import { ConversationPersona } from '@/components/conversation-persona'
import { InstallAppButton } from '@/components/pwa-install'
import { Drawer } from '@/components/ui/drawer'
import { TransitionLink } from '@/components/ui/transition-link'
import { useT } from '@/lib/i18n/client'
import { useImmersive } from './immersive'
import styles from './chat.module.css'

/** One entry point for room preferences; voice playback stays a deliberate user choice. */
export function RoomMenu({ sessionId, initialPersona, characterName, entry, portrait, messengerHref }: {
  sessionId: string; initialPersona: UserPersona | null; characterName: string
  entry?: CharacterEntry | null; portrait?: string | null; messengerHref?: string
}) {
  const t = useT()
  const { on, toggle } = useImmersive()
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const chooseMode = (voice: boolean) => { if (voice !== on) toggle() }
  return <>
    <button type="button" className={styles.roomMenuButton} aria-label={t('대화 메뉴')} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(true)}>
      <span aria-hidden="true">☰</span>
    </button>
    <Drawer id={menuId} open={open} onClose={() => setOpen(false)} title={t('대화 메뉴')}>
      <div className={styles.roomMenuItems}>
        <section className={styles.roomMenuGroup} aria-label={t('대화 모드')}>
          <h3 className={styles.roomMenuLabel}>{t('대화 모드')}</h3>
          <div className={styles.roomMenuModes} role="group" aria-label={t('대화 모드')}>
          <button type="button" className={styles.roomMenuItem} aria-pressed={!on} onClick={() => chooseMode(false)}><span>{t('채팅 모드')}</span><span aria-hidden="true">{!on ? '✓' : ''}</span></button>
          <button type="button" className={styles.roomMenuItem} aria-pressed={on} onClick={() => chooseMode(true)}><span>{t('음성 모드')}</span><span aria-hidden="true">{on ? '✓' : ''}</span></button>
          </div>
        </section>
        <section className={styles.roomMenuGroup} aria-label={t('채팅방 디자인 라이브러리')}>
          <h3 className={styles.roomMenuLabel}>{t('채팅방 디자인 라이브러리')}</h3>
          <ChatThemeOptions compact portrait={portrait} />
        </section>
        <section className={`${styles.roomMenuGroup} ${styles.roomMenuPersona}`} aria-label={t('페르소나 설정')}>
          <h3 className={styles.roomMenuLabel}>{t('페르소나 설정')}</h3>
          <ConversationPersona inline sessionId={sessionId} initial={initialPersona} characterName={characterName} entry={entry} />
        </section>
        <div className={styles.roomMenuGroup}>
          {messengerHref && <TransitionLink href={messengerHref} className={styles.roomMenuItem} onClick={() => setOpen(false)}><span>{t('메시지 창으로 이동')}</span><span aria-hidden="true">↗</span></TransitionLink>}
          <InstallAppButton className={styles.roomMenuItem} onOpen={() => setOpen(false)}><span>{t('홈 화면에 추가')}</span><span aria-hidden="true">＋</span></InstallAppButton>
        </div>
      </div>
    </Drawer>
  </>
}
