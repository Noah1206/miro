'use client'
import { ChatEmojiButton, ChatSendIcon, ChatInputMore } from '@/components/chat-input-tools'
import { useEffect, useRef, useState } from 'react'
import { Pressable } from '@/components/ui'
import styles from './messages.module.css'
import { useMessenger } from './delivery'
import { useT } from '@/lib/i18n/client'

/** Sending a message never waits for the character to read or generate a response. */
export function MessengerComposer() {
  const t = useT()
  const { send } = useMessenger()
  const [draft, setDraft] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 120)}px` } }, [draft])
  return (
    <div className={styles.composer}>
      <form className={styles.form} onSubmit={event => {
        event.preventDefault()
        if (!draft.trim()) return
        send(draft)
        setDraft('')
      }}>
        <ChatInputMore onInsert={text => { setDraft(value => (value + text).slice(0, 2000)); ta.current?.focus() }} />
        <textarea ref={ta} className={styles.input} value={draft} rows={1} maxLength={2000} placeholder={t('문자 보내기')} aria-label={t('문자 입력')}
          onChange={event => setDraft(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { event.preventDefault(); if (event.currentTarget.value.trim()) event.currentTarget.form?.requestSubmit() } }} />
        <ChatEmojiButton textareaRef={ta} onDraftChange={setDraft} onSelect={emoji => { setDraft(value => (value + emoji).slice(0, 2000)); ta.current?.focus() }} />
        <Pressable data-empty={!draft.trim()} type="submit" disabled={!draft.trim()} aria-label={t('보내기')} className={styles.send}><ChatSendIcon /></Pressable>
      </form>
    </div>
  )
}
