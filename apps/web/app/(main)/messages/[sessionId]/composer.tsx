'use client'
import { ChatEmojiButton, ChatSendIcon, ChatInputMore } from '@/components/chat-input-tools'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { ModelPicker } from '@/app/(main)/chat/[sessionId]/model-picker'
import glass from '@/components/chat-composer-glass.module.css'
import { Pressable } from '@/components/ui'
import styles from './messages.module.css'
import { useMessenger } from './delivery'
import { useT } from '@/lib/i18n/client'

/** Sending a message never waits for the character to read or generate a response. */
export function MessengerComposer({ modelOptions }: { modelOptions: ComponentProps<typeof ModelPicker> }) {
  const t = useT()
  const { send } = useMessenger()
  const [draft, setDraft] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 120)}px` } }, [draft])
  return (
    <div className={styles.composer} data-chat-composer>
      <form className={`${styles.form} ${styles.modelForm} ${glass.surface}`} autoComplete="off" onSubmit={event => {
        event.preventDefault()
        if (!draft.trim()) return
        send(draft)
        setDraft('')
      }}>
        <textarea ref={ta} className={styles.input} autoComplete="off" data-1p-ignore data-lpignore="true" value={draft} rows={1} maxLength={2000} placeholder={t('문자 보내기')} aria-label={t('문자 입력')}
          onChange={event => setDraft(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && (event.metaKey || event.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { event.preventDefault(); if (event.currentTarget.value.trim()) event.currentTarget.form?.requestSubmit() } }} />
        <div className={styles.modelRow}><div className={styles.modelTools}><ModelPicker {...modelOptions} place="up"/><ChatInputMore onInsert={text => { setDraft(value => (value + text).slice(0, 2000)); ta.current?.focus() }}/></div><div className={styles.sendTools}>
        <ChatEmojiButton textareaRef={ta} onDraftChange={setDraft} onSelect={emoji => { setDraft(value => (value + emoji).slice(0, 2000)); ta.current?.focus() }} />
        <Pressable data-empty={!draft.trim()} type="submit" disabled={!draft.trim()} aria-label={t('보내기')} className={styles.send}><ChatSendIcon /></Pressable>
        </div></div>
      </form>
    </div>
  )
}
