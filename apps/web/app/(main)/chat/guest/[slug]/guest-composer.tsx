'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Pressable, useLoginSheet } from '@/components/ui'
import { useT } from '@/lib/i18n/client'
import { COPY } from '@/lib/copy'
import { GUEST_PENDING, GUEST_SEND } from '@/lib/guest-chat'
import { WELCOME_PARAM } from '@/lib/onboarding-options'
import { ChatSendIcon } from '@/components/chat-input-tools'
import glass from '@/components/chat-composer-glass.module.css'
import styles from '../../[sessionId]/chat.module.css'
import { SuggestList, type SuggestState } from '../../[sessionId]/suggest-replies'
import type { Suggestion } from '@/lib/suggest-prompt'
import { enterFromGuest, guestSuggest } from './actions'

/**
 * 게스트 대화창의 입력창(11/27 사용자) — 로그인 전에도 인트로를 보고 말을 적는다. 보내기나 추천 답변 카드를 누르면 그 말을 기기에 적어 두고 로그인 시트를 띄운다.
 * 로그인·온보딩을 마치고 이 화면으로 돌아오면(signedIn) 방을 만들고 적어 둔 말을 그 방 입력창에 넘겨 바로 보내게 한다.
 */
export function GuestComposer({ slug, scene, signedIn, firstReplies }: { slug: string; scene?: string; signedIn: boolean; firstReplies: Suggestion[] }) {
  const t = useT(), router = useRouter(), askLogin = useLoginSheet()
  const [draft, setDraft] = useState('')
  const [suggest, setSuggest] = useState<SuggestState>(() => firstReplies.length ? firstReplies : null)
  const [error, setError] = useState('')
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setSlot(document.getElementById('suggest-slot')) }, [])
  useEffect(() => { if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = `${Math.min(ta.current.scrollHeight, 320)}px` } }, [draft])

  const entered = useRef(false)
  useEffect(() => {
    if (!signedIn || entered.current) return
    entered.current = true
    let text = ''
    try {
      const p = JSON.parse(localStorage.getItem(GUEST_PENDING) ?? 'null')
      localStorage.removeItem(GUEST_PENDING)
      if (p?.slug === slug && typeof p.text === 'string' && Date.now() - Number(p.at) < 86_400_000) text = p.text.slice(0, 2000)
    } catch { /* 저장소를 막은 브라우저 — 방만 연다 */ }
    void enterFromGuest(slug, scene).then(r => {
      if ('error' in r) { router.replace(`/character/${slug}`); return }
      if (text) try { localStorage.setItem(GUEST_SEND, JSON.stringify({ sessionId: r.sessionId, text, at: Date.now() })) } catch {}
      // 가입 선물 팝업(?welcome=1)은 대화방에서 뜨게 그대로 넘긴다.
      router.replace(`/chat/${r.sessionId}${new URLSearchParams(location.search).has(WELCOME_PARAM) ? `?${WELCOME_PARAM}=1` : ''}`)
    })
  }, [signedIn, slug, scene, router])

  const hold = (text: string) => {
    if (!text.trim() || signedIn) return
    try { localStorage.setItem(GUEST_PENDING, JSON.stringify({ slug, text: text.trim(), at: Date.now() })) } catch {}
    askLogin(`/chat/guest/${slug}${scene ? `?scene=${encodeURIComponent(scene)}` : ''}`)
  }
  const asText = (o: Suggestion) => [o.say && `"${o.say}"`, o.act && `*${o.act}*`].filter(Boolean).join(' ')

  return <div className={styles.composer} data-chat-composer>
    {suggest && (list => slot ? createPortal(list, slot) : list)(<SuggestList state={suggest} onClose={() => setSuggest(null)} onPick={(text, send) => {
      setDraft(text); setSuggest(null)
      if (send) hold(text); else ta.current?.focus()
    }} />)}
    {error && <p role="alert" className="t-caption" style={{ marginBottom: 8, color: 'var(--color-danger)' }}>{t(error)}</p>}
    <form autoComplete="off" onSubmit={e => { e.preventDefault(); hold(draft) }} className={`${styles.composerForm} ${glass.surface}`}>
      <div className={styles.inputRow}>
        <textarea className={styles.input} ref={ta} name="input" autoComplete="off" value={draft} rows={1} maxLength={2000} disabled={signedIn}
          placeholder={t('대사, 행동, 묘사를 자유롭게…')} aria-label={t(COPY.a11y.composer)}
          onChange={e => setDraft(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey || window.matchMedia('(pointer: fine)').matches)) { e.preventDefault(); hold(draft) } }} />
      </div>
      <div className={styles.composerRow}>
        <div className={styles.composerTools} />
        <div className={styles.composerBar}>
          <button type="button" className={styles.suggestPill} disabled={signedIn || suggest === 'loading'} aria-busy={suggest === 'loading'} aria-expanded={Array.isArray(suggest)} aria-label={t('추천 답변')} title={t('추천 답변')}
            onClick={async () => {
              if (Array.isArray(suggest)) { setSuggest(null); return }
              setSuggest('loading'); setError('')
              const r = await guestSuggest(slug, scene)
              if ('error' in r) { setSuggest(null); setError(r.error) } else setSuggest(r.options)
            }}>
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" />
            </svg>
            <span>{t('추천 답변')}</span>
          </button>
          <Pressable data-empty={!draft.trim()} type="submit" disabled={signedIn || !draft.trim()} aria-label={t(COPY.cta.send)} className={styles.send}><ChatSendIcon /></Pressable>
        </div>
      </div>
    </form>
  </div>
}
