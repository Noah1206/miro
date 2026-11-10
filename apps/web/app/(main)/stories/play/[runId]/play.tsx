'use client'
import { useT } from '@/lib/i18n/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoryEntry } from '@miro/domain'
import { StoryBriefing } from '@/components/stories/story-briefing'
import { StoryPassage } from '@/components/stories/story-passage'
import { Back, Button, Sheet, Switch, TransitionLink } from '@/components/ui'
import { ChatThemePicker, ChatHeaderAvatar } from '@/components/chat-theme'
import { MessengerThread } from '../../../messages/[sessionId]/thread'
import messengerStyles from '../../../messages/[sessionId]/messages.module.css'
import { ChatSendIcon } from '@/components/chat-input-tools'
import { CharacterVisual } from '@/components/character-visual'
import type { StoryMessageView } from '@/lib/stories/turn'
import type { RunView } from '@/lib/stories/view'
import { readStoryThread, setStoryContact, setStoryTimeZone } from '../../actions'

type Props = {
  entry?: StoryEntry; messenger?: boolean; runId: string; runNo: number; archived: boolean; slug: string; title: string; opening: string; medium: string
  characters: { key: string; name: string; image: string | null }[]; timeZone: string | null; initialMessages: StoryMessageView[]; initialView: RunView; initialTab: string
}
type Block = { kind: 'narration' | 'dialogue'; speaker: string | null; text: string }

const OUTCOME: Record<string, string> = { colleague: '동료', explore: '더 알아가기', exploring: '더 알아가기', romance: '연인', partner: '연인', space: '거리 두기' }
const newTurnId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, '')

/** 장면(서술+대사)과 인물별 연락석을 한 화면에서. 선택 예시는 입력 칸을 채울 뿐 — 무엇을 할지는 자유 입력이다. */
export function StoryPlay(p: Props) {
  const t = useT()
  const [messages, setMessages] = useState(p.initialMessages)
  const [view, setView] = useState(p.initialView)
  const [tab, setTab] = useState(p.initialTab)
  const [archived, setArchived] = useState(p.archived)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [openingDone, setOpeningDone] = useState(p.initialMessages.some(m => m.channel === 'scene'))
  const initialIds = useRef(new Set(p.initialMessages.map(m => m.id)))
  const [progressOpen, setProgressOpen] = useState(false)
  const [tz, setTz] = useState(p.timeZone)
  const sending = useRef(false)
  const bottom = useRef<HTMLDivElement>(null)
  const images = useMemo(() => new Map(p.characters.map(c => [c.key, c.image])), [p.characters])
  const names = useMemo(() => new Map(p.characters.map(c => [c.key, c.name])), [p.characters])
  const unread = useMemo(() => new Set(messages.filter(m => m.channel === 'dm' && !m.read).map(m => m.thread)), [messages])
  const shown = messages.filter(m => (tab === 'scene' ? m.channel === 'scene' : m.channel === 'dm' && m.thread === tab))

  const followText = useCallback(() => { bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' }) }, [])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [shown.length, tab])
  useEffect(() => {
    if (tab === 'scene' || !unread.has(tab)) return
    const ids = messages.filter(m => m.channel === 'dm' && m.thread === tab && !m.read).map(m => m.id)
    void readStoryThread(p.runId, tab, ids).then(result => { if (result?.ok) setMessages(ms => ms.map(m => ids.includes(m.id) ? { ...m, read: true } : m)) }).catch(() => {})
  }, [tab, unread, p.runId, messages])

  useEffect(() => {
    let active = true
    let fetching = false
    const controller = new AbortController()
    async function refresh() {
      if (document.visibilityState !== 'visible' || fetching || sending.current) return
      fetching = true
      try {
        const params = new URLSearchParams({ runId: p.runId, ...(p.messenger ? { thread: p.initialTab } : {}) })
        const response = await fetch(`/api/stories/messages?${params}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        const data = await response.json()
        if (active && !sending.current) { setMessages(data.messages); setView(data.view); setArchived(data.archived) }
      } catch { /* Keep the current conversation when offline. */ }
      finally { fetching = false }
    }
    const timer = window.setInterval(refresh, 15_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [p.runId, p.messenger, p.initialTab])

  async function send(retry?: { id: string; text: string }) {
    const body = retry ?? { id: newTurnId(), text: text.trim() }
    if (!body.text || busy) return
    sending.current = true
    setOpeningDone(true)
    setBusy(true); setError(null); setPending(body)
    try {
      const res = await fetch('/api/stories/turn', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: p.runId, clientTurnId: body.id, text: body.text, channel: tab === 'scene' ? 'scene' : 'dm', thread: tab === 'scene' ? null : tab }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error === 'turn_running' ? t('앞의 입력을 아직 처리하고 있어요. 잠시 뒤 다시 보내 주세요.') : data.error === 'archived_run' ? t('보관된 회차예요. 이어서 진행할 수 없어요.') : t('보내지 못했어요. 같은 내용으로 다시 보낼 수 있어요.'))
        return
      }
      setMessages(ms => [...ms.filter(m => !data.messages.some((n: StoryMessageView) => n.id === m.id)), ...data.messages])
      if (data.view) setView(data.view)
      setText(''); setPending(null)
    } catch {
      setError(t('연결이 끊겼어요. 같은 내용으로 다시 보내면 한 번만 반영돼요.'))
    } finally { sending.current = false; setBusy(false) }
  }

  async function toggleContact(key: string, on: boolean) {
    const r = await setStoryContact(p.runId, key, on ? 'allowed' : 'stopped')
    if (r.ok) setView(r.view)
  }

  const tabs = [{ key: 'scene', label: t('장면') }, ...p.characters.map(c => ({ key: c.key, label: c.name.split(' ')[0]! }))]
  const settingsSheet = (
    <>
    <Sheet open={progressOpen} onClose={() => setProgressOpen(false)} title={t('진행')}>
        <div className="stack" style={{ gap: 18, padding: '0 var(--gutter) var(--space-6)' }}>
          {p.entry && <Button type="button" variant="secondary" full onClick={() => { setProgressOpen(false); setGuideOpen(true) }}>{t('세계관과 내 역할 다시 보기')}</Button>}
          <section className="stack" style={{ gap: 6 }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('지나온 사건')}</p>
            {view.progress.completed.length ? view.progress.completed.map((c, i) => <p key={c.id} className="t-body">{i + 1}. {c.title}</p>) : <p className="t-caption">{t('아직 끝낸 사건이 없어요.')}</p>}
          </section>
          <section className="stack" style={{ gap: 6 }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('내가 알게 된 것')}</p>
            {view.progress.clues.length ? view.progress.clues.map(c => <p key={c} className="t-caption" style={{ lineHeight: 1.6 }}>· {c}</p>) : <p className="t-caption">{t('아직 없어요.')}</p>}
          </section>
          {view.progress.promises.length > 0 && (
            <section className="stack" style={{ gap: 6 }}>
              <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('나눈 약속')}</p>
              {view.progress.promises.map((pr, i) => <p key={i} className="t-caption">· {pr.who}: {pr.text}</p>)}
            </section>
          )}
          <section className="stack" style={{ gap: 10 }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{t('등장인물의 먼저 오는 연락')}</p>
            {tz
              ? <p className="t-micro" style={{ color: 'var(--color-text-secondary)' }}>{t('받는 시간대: {zone} · 밤 10시~아침 9시엔 보내지 않아요.', { zone: tz })}</p>
              : <div className="stack" style={{ gap: 6 }}>
                  <p className="t-caption">{t('연락 받을 시간대가 정해지지 않아 먼저 오는 연락을 잠시 멈춰 두었어요.')}</p>
                  <Button type="button" variant="secondary" size="sm" onClick={async () => {
                    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
                    if ((await setStoryTimeZone(zone)).ok) setTz(zone)
                  }}>{t('이 기기 시간대로 설정')}</Button>
                </div>}
            {view.progress.relations.map(r => (
              <Switch key={r.key} name={`contact-${r.key}`} label={r.name} hint={r.outcome ? t('관계: {name}', { name: t(OUTCOME[r.outcome] ?? r.outcome) }) : undefined}
                checked={r.contact === 'allowed'} onChange={on => toggleContact(r.key, on)} />
            ))}
            <p className="t-micro" style={{ color: 'var(--color-text-secondary)' }}>{t('끄면 그 인물의 예정된 연락도 바로 취소돼요. 앱을 오래 열지 않아도 이야기와 관계는 그대로예요.')}</p>
          </section>
        </div>
      </Sheet>
      {p.entry && <Sheet open={guideOpen} onClose={() => setGuideOpen(false)} title={t('세계관과 내 역할')}>
        <div style={{ padding: '0 var(--gutter) var(--space-6)' }}><StoryBriefing entry={p.entry} /></div>
      </Sheet>}
    </>
  )
  if (p.messenger) return (
    <main id="main" tabIndex={-1} className="chat-layout" style={{ outline: 'none', background: 'var(--color-bg)' }}>
      <section className={`chat-main ${messengerStyles.main}`}>
        <header className={messengerStyles.header}>
          <Back href="/archive" /><ChatHeaderAvatar />
          <h1 className={messengerStyles.title}>{names.get(tab)}</h1>
          <TransitionLink href={`/stories/play/${p.runId}`} className={messengerStyles.headerLink}>{t('이야기 이어가기')}</TransitionLink>
          <Button type="button" variant="ghost" size="sm" onClick={() => setProgressOpen(true)}>{t('진행')}</Button>
          <ChatThemePicker />
        </header>
        <p className={messengerStyles.notice} style={{ padding: '8px 12px' }}>{p.title} · {t('{n}회차', { n: p.runNo })}</p>
        <MessengerThread characterName={names.get(tab) ?? ''} portrait={images.get(tab)} items={[
          ...shown.map(m => ({ id: m.id, role: m.role, kind: 'messenger', content: m.content, blocks: [], at: m.createdAt })),
          ...(busy && pending ? [{ id: pending.id, role: 'user', kind: 'messenger', content: pending.text, blocks: [], at: new Date().toISOString(), delivery: 'sending' as const }] : []),
        ]} />
        {error && <p role="alert" className={messengerStyles.notice}>{error} {pending && <Button type="button" variant="ghost" size="sm" onClick={() => send(pending)}>{t('다시 보내기')}</Button>}</p>}
        {archived ? <p className={messengerStyles.notice}>{t('보관된 회차예요. 새 회차의 대화는 따로 이어져요.')}</p> : (
          <div className={messengerStyles.composer}>
            <form className={messengerStyles.form} onSubmit={e => { e.preventDefault(); void send() }}>
              <textarea className={messengerStyles.input} rows={1} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder={t('문자 보내기')} aria-label={t('문자 입력')}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send() } }} />
              <button type="submit" className={messengerStyles.send} disabled={busy || !text.trim()} aria-label={t('보내기')}><ChatSendIcon /></button>
            </form>
          </div>
        )}
      </section>
      {settingsSheet}
    </main>
  )
  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', padding: 0 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--color-bg)', padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) 0', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Back href={p.messenger ? '/archive' : `/stories/${p.slug}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="t-caption" style={{ fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.messenger ? names.get(tab) : p.title}</p>
            <p className="t-micro" style={{ color: 'var(--color-text-secondary)' }}>
              {t('{n}회차', { n: p.runNo })} · {view.progress.ended ? `${t('시즌 종료')}${view.progress.ending ? ` — ${view.progress.ending}` : ''}` : `${t('{n}장', { n: view.progress.chapter })}${view.chapterTitle ? ` · ${view.chapterTitle}` : ''}`}
            </p>
          </div>
          {p.messenger && <TransitionLink href={`/stories/play/${p.runId}`} className="t-caption">{t('이야기 이어가기')}</TransitionLink>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setProgressOpen(true)}>{t('진행')}</Button>
        </div>
        {!p.messenger && <div role="tablist" aria-label={t('장면과 연락')} style={{ display: 'flex', gap: 4, overflowX: 'auto', marginTop: 6 }}>
          {tabs.map(item => (
            <button key={item.key} role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className="t-caption"
              style={{ position: 'relative', padding: '10px 12px', minHeight: 44, whiteSpace: 'nowrap', background: 'none', border: 0, color: tab === item.key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                borderBottom: `2px solid ${tab === item.key ? 'var(--color-accent)' : 'transparent'}`, fontWeight: tab === item.key ? 'var(--weight-semibold)' : 400 }}>
              {item.label}
              {unread.has(item.key) && <span aria-label={t('읽지 않은 연락')} style={{ position: 'absolute', top: 8, right: 4, width: 6, height: 6, borderRadius: 3, background: 'var(--color-accent)' }} />}
            </button>
          ))}
        </div>}
      </header>

      <section aria-live="polite" style={{ flex: 1, padding: 'var(--space-4) var(--gutter)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'scene'
          ? <StoryPassage parts={p.opening.split(/\n\n+/).map(text => ({ text }))} animate={!openingDone} onDone={() => setOpeningDone(true)} onGrow={!openingDone ? followText : undefined} />
          : <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
              <div style={{ width: 72 }}><CharacterVisual name={names.get(tab) ?? ''} accent={null} slug={`${p.slug}-${tab}`} photo={images.get(tab) ?? null} ratio="1 / 1" size="avatar" shared={false} scrim={false} style={{ borderRadius: '50%' }} /></div>
              <p className="t-micro" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>{p.title} · {t('{n}회차', { n: p.runNo })} · {p.medium}</p>
            </div>}
        {shown.map(m => <Message key={m.id} m={m} names={names} animate={!initialIds.current.has(m.id)} onDone={() => { initialIds.current.add(m.id) }} onGrow={followText} avatar={m.channel === 'dm' && m.role === 'character' ? <div style={{ width: 32, flexShrink: 0 }}><CharacterVisual name={names.get(m.thread ?? '') ?? ''} accent={null} slug={`${p.slug}-${m.thread}`} photo={images.get(m.thread ?? '') ?? null} ratio="1 / 1" size="avatar" shared={false} scrim={false} style={{ borderRadius: '50%' }} /></div> : null} />)}
        {busy && pending && <div style={{ alignSelf: 'flex-end', maxWidth: '82%', opacity: 0.6 }} className="t-body">{pending.text}</div>}
        {busy && <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>…</p>}
        {view.progress.ended && tab === 'scene' && <p className="t-caption" style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-1)' }}>{t('시즌이 끝났어요. 정한 진로와 관계를 바탕으로 일상이 이어져요. 새 사건은 원할 때만 열려요.')}</p>}
        <div ref={bottom} />
      </section>

      {!archived && (
        <footer style={{ position: 'sticky', bottom: 0, background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', padding: 'var(--space-3) var(--gutter) calc(var(--space-3) + env(safe-area-inset-bottom))' }}>
          {tab === 'scene' && openingDone && view.hints.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }} aria-label={t('행동 예시')}>
              {view.hints.map(h => (
                <button key={h.id} type="button" className="t-micro" onClick={() => setText(h.text)}
                  style={{ flexShrink: 0, padding: '8px 10px', minHeight: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-secondary)' }}>{h.text}</button>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)', marginBottom: 6 }}>
              {error} {pending && <button type="button" onClick={() => send(pending)} style={{ color: 'var(--color-accent-text)', background: 'none', border: 0, textDecoration: 'underline' }}>{t('다시 보내기')}</button>}
            </p>
          )}
          <form onSubmit={e => { e.preventDefault(); void send() }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={1000} rows={2} aria-label={tab === 'scene' ? t('내 행동이나 대사') : t('{name}에게 보낼 말', { name: names.get(tab) ?? '' })}
              placeholder={tab === 'scene' ? (view.premiseRefused ? t('어떤 설정이면 좋을지 말해 주세요') : t('무엇을 하거나 말할까요? (자유롭게)')) : t('메시지를 입력하세요')}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
              style={{ flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body)', lineHeight: 1.5 }} />
            <Button type="submit" variant="primary" disabled={busy || !text.trim()}>{t('보내기')}</Button>
          </form>
        </footer>
      )}

      {archived && <p className="t-caption" style={{ padding: 'var(--space-4) var(--gutter)' }}>{t('보관된 회차예요. 새 회차의 대화는 따로 이어져요.')}</p>}
      {settingsSheet}
    </main>
  )
}

function Message({ m, names, avatar, animate, onGrow, onDone }: { m: StoryMessageView; names: Map<string, string>; avatar?: React.ReactNode; animate?: boolean; onGrow?: () => void; onDone?: () => void }) {
  if (m.role === 'user') return <div className="t-body" style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', whiteSpace: 'pre-line' }}>{m.content}</div>
  if (m.channel === 'dm') return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth: '88%' }}>
      {avatar}
      <div className="t-body" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)', whiteSpace: 'pre-line' }}>{m.content}</div>
    </div>
  )
  const blocks = (m.blocks as Block[] | null) ?? [{ kind: 'narration', speaker: null, text: m.content }]
  return <StoryPassage parts={blocks.map(b => ({ text: b.text, label: b.kind === 'dialogue' && b.speaker ? names.get(b.speaker) ?? b.speaker : undefined, narration: b.kind !== 'dialogue' }))} animate={animate} onDone={onDone} onGrow={animate ? onGrow : undefined} />
}
