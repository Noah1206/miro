'use client'
import { useState, type ComponentProps } from 'react'
import { Popover, MenuItem } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { ChatThemePicker } from './chat-theme'
import { StoryDate } from '@/app/(main)/chat/[sessionId]/story-date'
import styles from './chat-settings-menu.module.css'

type StoryDateOptions = Pick<ComponentProps<typeof StoryDate>, 'sessionId' | 'date' | 'today' | 'disabled'>

export function ChatSettingsMenu({ storyDate }: { storyDate?: StoryDateOptions }) {
  const t = useT()
  const [panel, setPanel] = useState<'menu' | 'theme' | 'date' | null>(null)
  return <>
    <div className={styles.anchor}>
      <button type="button" className={styles.trigger} aria-label={t('설정')} aria-haspopup="menu" aria-expanded={panel === 'menu'}
        onClick={() => setPanel(panel === 'menu' ? null : 'menu')}>
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <Popover open={panel === 'menu'} onClose={() => setPanel(current => current === 'menu' ? null : current)} anchor="right" style={{ minWidth: 180, padding: 0, background: 'transparent', boxShadow: 'none', borderRadius: 0, color: 'inherit' }}>
        <MenuItem type="button" onClick={() => setPanel('theme')}>{t('채팅방 테마')}</MenuItem>
        {storyDate && <MenuItem type="button" disabled={storyDate.disabled} onClick={() => setPanel('date')}>{t('세계관 날짜')}</MenuItem>}
      </Popover>
    </div>
    <ChatThemePicker hideTrigger open={panel === 'theme'} onOpenChange={open => setPanel(open ? 'theme' : null)} />
    {storyDate && <StoryDate {...storyDate} hideTrigger open={panel === 'date'} onOpenChange={open => setPanel(open ? 'date' : null)} />}
  </>
}
