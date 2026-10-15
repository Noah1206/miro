'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Back, Button, Sheet, Switch } from '@/components/ui'
import { CharacterVisual } from '@/components/character-visual'
import { withParticle } from '@/lib/format'
import type { StoryMessageView } from '@/lib/stories/turn'
import type { RunView } from '@/lib/stories/view'
import { readStoryThread, setStoryContact, setStoryTimeZone } from '../../actions'

type Props = {
  runId: string; runNo: number; archived: boolean; slug: string; title: string; opening: string; medium: string
  characters: { key: string; name: string; image: string | null }[]; timeZone: string | null; initialMessages: StoryMessageView[]; initialView: RunView; initialTab: string
}
type Block = { kind: 'narration' | 'dialogue'; speaker: string | null; text: string }

const OUTCOME: Record<string, string> = { colleague: '동료', explore: '더 알아가기', exploring: '더 알아가기', romance: '연인', partner: '연인', space: '거리 두기' }
const newTurnId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, '')

/** 장면(서술+대사)과 인물별 연락석을 한 화면에서. 선택 예시는 입력 칸을 채울 뿐 — 무엇을 할지는 자유 입력이다. */
export function StoryPlay(p: Props) {
  const [messages, setMessages] = useState(p.initialMessages)
  const [view, setView] = useState(p.initialView)
  const [tab, setTab] = useState(p.initialTab)
  const [text, setText] = useState('')
  const [pending, setPending] = useState<{ id: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [tz, setTz] = useState(p.timeZone)
  const bottom = useRef<HTMLDivElement>(null)
  const images = useMemo(() => new Map(p.characters.map(c => [c.key, c.image])), [p.characters])
  const names = useMemo(() => new Map(p.characters.map(c => [c.key, c.name])), [p.characters])
  const unread = useMemo(() => new Set(messages.filter(m => m.channel === 'dm' && !m.read).map(m => m.thread)), [messages])
  const shown = messages.filter(m => (tab === 'scene' ? m.channel === 'scene' : m.channel === 'dm' && m.thread === tab))

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [shown.length, tab])
  useEffect(() => {
    if (tab === 'scene' || !unread.has(tab)) return
    void readStoryThread(p.runId, tab)
    setMessages(ms => ms.map(m => (m.channel === 'dm' && m.thread === tab ? { ...m, read: true } : m)))
  }, [tab, unread, p.runId])

  async function send(retry?: { id: string; text: string }) {
    const body = retry ?? { id: newTurnId(), text: text.trim() }
    if (!body.text || busy) return
    setBusy(true); setError(null); setPending(body)
    try {
      const res = await fetch('/api/stories/turn', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: p.runId, clientTurnId: body.id, text: body.text, channel: tab === 'scene' ? 'scene' : 'dm', thread: tab === 'scene' ? null : tab }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error === 'turn_running' ? '앞의 입력을 아직 처리하고 있어요. 잠시 뒤 다시 보내 주세요.' : data.error === 'archived_run' ? '보관된 회차예요. 이어서 진행할 수 없어요.' : '보내지 못했어요. 같은 내용으로 다시 보낼 수 있어요.')
        return
      }
      setMessages(ms => [...ms.filter(m => !data.messages.some((n: StoryMessageView) => n.id === m.id)), ...data.messages])
      if (data.view) setView(data.view)
      setText(''); setPending(null)
    } catch {
      setError('연결이 끊겼어요. 같은 내용으로 다시 보내면 한 번만 반영돼요.')
    } finally { setBusy(false) }
  }

  async function toggleContact(key: string, on: boolean) {
    const r = await setStoryContact(p.runId, key, on ? 'allowed' : 'stopped')
    if (r.ok) setView(r.view)
  }

  const tabs = [{ key: 'scene', label: '장면' }, ...p.characters.map(c => ({ key: c.key, label: c.name.split(' ')[0]! }))]
  return (
    <main className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', padding: 0 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--color-bg)', padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--gutter) 0', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Back href={`/stories/${p.slug}`} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="t-caption" style={{ fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</p>
            <p className="t-micro" style={{ color: 'var(--color-text-secondary)' }}>
              {p.runNo}회차 · {view.progress.ended ? `시즌 종료${view.progress.ending ? ` — ${view.progress.ending}` : ''}` : `${view.progress.chapter}장${view.chapterTitle ? ` · ${view.chapterTitle}` : ''}`}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setProgressOpen(true)}>진행</Button>
        </div>
        <div role="tablist" aria-label="장면과 연락" style={{ display: 'flex', gap: 4, overflowX: 'auto', marginTop: 6 }}>
          {tabs.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className="t-caption"
              style={{ position: 'relative', padding: '10px 12px', minHeight: 44, whiteSpace: 'nowrap', background: 'none', border: 0, color: tab === t.key ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                borderBottom: `2px solid ${tab === t.key ? 'var(--color-accent)' : 'transparent'}`, fontWeight: tab === t.key ? 'var(--weight-semibold)' : 400 }}>
              {t.label}
              {unread.has(t.key) && <span aria-label="읽지 않은 연락" style={{ position: 'absolute', top: 8, right: 4, width: 6, height: 6, borderRadius: 3, background: 'var(--color-accent)' }} />}
            </button>
          ))}
        </div>
      </header>

      <section aria-live="polite" style={{ flex: 1, padding: 'var(--space-4) var(--gutter)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'scene'
          ? <p className="t-body" style={{ whiteSpace: 'pre-line', lineHeight: 1.75 }}>{p.opening}</p>
          : <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
              <div style={{ width: 72 }}><CharacterVisual name={names.get(tab) ?? ''} accent={null} slug={`${p.slug}-${tab}`} photo={images.get(tab) ?? null} ratio="1 / 1" size="avatar" shared={false} scrim={false} style={{ borderRadius: '50%' }} /></div>
              <p className="t-micro" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>{names.get(tab)}와(과)의 {p.medium}. 이야기 속 연락이며 실제 메신저와 연결되지 않아요.</p>
            </div>}
        {shown.map(m => <Message key={m.id} m={m} names={names} avatar={m.channel === 'dm' && m.role === 'character' ? <div style={{ width: 32, flexShrink: 0 }}><CharacterVisual name={names.get(m.thread ?? '') ?? ''} accent={null} slug={`${p.slug}-${m.thread}`} photo={images.get(m.thread ?? '') ?? null} ratio="1 / 1" size="avatar" shared={false} scrim={false} style={{ borderRadius: '50%' }} /></div> : null} />)}
        {busy && pending && <div style={{ alignSelf: 'flex-end', maxWidth: '82%', opacity: 0.6 }} className="t-body">{pending.text}</div>}
        {busy && <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>…</p>}
        {view.progress.ended && tab === 'scene' && <p className="t-caption" style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-1)' }}>시즌이 끝났어요. 정한 진로와 관계를 바탕으로 일상이 이어져요. 새 사건은 원할 때만 열려요.</p>}
        <div ref={bottom} />
      </section>

      {!p.archived && (
        <footer style={{ position: 'sticky', bottom: 0, background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', padding: 'var(--space-3) var(--gutter) calc(var(--space-3) + env(safe-area-inset-bottom))' }}>
          {tab === 'scene' && view.hints.length > 0 && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }} aria-label="행동 예시">
              {view.hints.map(h => (
                <button key={h.id} type="button" className="t-micro" onClick={() => setText(h.text)}
                  style={{ flexShrink: 0, padding: '8px 10px', minHeight: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-secondary)' }}>{h.text}</button>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="t-caption" style={{ color: 'var(--color-danger)', marginBottom: 6 }}>
              {error} {pending && <button type="button" onClick={() => send(pending)} style={{ color: 'var(--color-accent-text)', background: 'none', border: 0, textDecoration: 'underline' }}>다시 보내기</button>}
            </p>
          )}
          <form onSubmit={e => { e.preventDefault(); void send() }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={1000} rows={2} aria-label={tab === 'scene' ? '내 행동이나 대사' : `${names.get(tab)}에게 보낼 말`}
              placeholder={tab === 'scene' ? (view.premiseRefused ? '어떤 설정이면 좋을지 말해 주세요' : '무엇을 하거나 말할까요? (자유롭게)') : `${withParticle(p.medium, '으로', '로')} 보낼 말`}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
              style={{ flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text-primary)', fontSize: 'var(--font-body)', lineHeight: 1.5 }} />
            <Button type="submit" variant="primary" disabled={busy || !text.trim()}>보내기</Button>
          </form>
        </footer>
      )}

      <Sheet open={progressOpen} onClose={() => setProgressOpen(false)} title="진행">
        <div className="stack" style={{ gap: 18, padding: '0 var(--gutter) var(--space-6)' }}>
          <section className="stack" style={{ gap: 6 }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>지나온 사건</p>
            {view.progress.completed.length ? view.progress.completed.map((c, i) => <p key={c.id} className="t-body">{i + 1}. {c.title}</p>) : <p className="t-caption">아직 끝낸 사건이 없어요.</p>}
          </section>
          <section className="stack" style={{ gap: 6 }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>내가 알게 된 것</p>
            {view.progress.clues.length ? view.progress.clues.map(c => <p key={c} className="t-caption" style={{ lineHeight: 1.6 }}>· {c}</p>) : <p className="t-caption">아직 없어요.</p>}
          </section>
          {view.progress.promises.length > 0 && (
            <section className="stack" style={{ gap: 6 }}>
              <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>나눈 약속</p>
              {view.progress.promises.map((pr, i) => <p key={i} className="t-caption">· {pr.who}: {pr.text}</p>)}
            </section>
          )}
          <section className="stack" style={{ gap: 10 }}>
            <p className="t-caption" style={{ color: 'var(--color-text-secondary)' }}>{p.medium} 먼저 받기</p>
            {tz
              ? <p className="t-micro" style={{ color: 'var(--color-text-secondary)' }}>받는 시간대: {tz} · 밤 10시~아침 9시엔 보내지 않아요.</p>
              : <div className="stack" style={{ gap: 6 }}>
                  <p className="t-caption">연락 받을 시간대가 정해지지 않아 먼저 오는 연락을 잠시 멈춰 두었어요.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={async () => {
                    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
                    if ((await setStoryTimeZone(zone)).ok) setTz(zone)
                  }}>이 기기 시간대로 설정</Button>
                </div>}
            {view.progress.relations.map(r => (
              <Switch key={r.key} name={`contact-${r.key}`} label={r.name} hint={r.outcome ? `관계: ${OUTCOME[r.outcome] ?? r.outcome}` : undefined}
                checked={r.contact === 'allowed'} onChange={on => toggleContact(r.key, on)} />
            ))}
            <p className="t-micro" style={{ color: 'var(--color-text-secondary)' }}>끄면 그 인물의 예정된 연락도 바로 취소돼요. 앱을 오래 열지 않아도 이야기와 관계는 그대로예요.</p>
          </section>
        </div>
      </Sheet>
    </main>
  )
}

function Message({ m, names, avatar }: { m: StoryMessageView; names: Map<string, string>; avatar?: React.ReactNode }) {
  if (m.role === 'user') return <div className="t-body" style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', whiteSpace: 'pre-line' }}>{m.content}</div>
  if (m.channel === 'dm') return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', alignSelf: 'flex-start', maxWidth: '88%' }}>
      {avatar}
      <div className="t-body" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-1)', whiteSpace: 'pre-line' }}>{m.content}</div>
    </div>
  )
  const blocks = (m.blocks as Block[] | null) ?? [{ kind: 'narration', speaker: null, text: m.content }]
  return (
    <div className="stack" style={{ gap: 10 }}>
      {blocks.map((b, i) => b.kind === 'dialogue' && b.speaker
        ? <p key={i} className="t-body" style={{ lineHeight: 1.7 }}><strong>{names.get(b.speaker) ?? b.speaker}</strong> {b.text}</p>
        : <p key={i} className="t-body" style={{ lineHeight: 1.75, whiteSpace: 'pre-line', color: 'var(--color-text-secondary)' }}>{b.text}</p>)}
    </div>
  )
}
