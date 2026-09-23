'use client'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button, ButtonLink, Sheet, TextArea, TransitionLink } from '@/components/ui'
import { CharacterText, Line, UserText } from '@/components/scene/text'
import { YUJIN } from '@/lib/alpha/character'
import type { AlphaMessage } from '@/lib/alpha/session'
import type { ChatResponse } from '@/app/api/chat/route'

type Item = AlphaMessage & { id: string; reality?: boolean }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let seq = 0
const withId = (m: AlphaMessage, reality = false): Item => ({ ...m, id: `${m.at}-${seq++}`, reality })

/**
 * 메신저처럼 보이는 대화. 관계 숫자는 어디에도 없다 — 답장 속도·말투·먼저 오는 메시지로만 느낀다.
 * 처음엔 빠른 답장 세 개, 그 뒤엔 자유 입력.
 */
export function AlphaChat({ initial, hasReplied }: { initial: AlphaMessage[]; hasReplied: boolean }) {
  const [items, setItems] = useState<Item[]>(() => initial.map((m) => withId(m, m.reality === true)))
  const [typing, setTyping] = useState(false)
  const [pending, setPending] = useState(false)
  const [quick, setQuick] = useState(!hasReplied)
  const [limit, setLimit] = useState<ChatResponse['limit'] | null>(null)
  const [cliff, setCliff] = useState(false)
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const ta = useRef<HTMLTextAreaElement>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [items, typing])

  async function send(raw: string) {
    const msg = raw.trim()
    if (!msg || pending) return
    setPending(true); setQuick(false); setText(''); setNotice(null)
    if (ta.current) ta.current.style.height = 'auto'
    setItems((xs) => [...xs, withId({ role: 'user', text: msg, at: new Date().toISOString() })])

    let res: ChatResponse | null = null
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ text: msg }) })
      if (r.status === 401) { window.location.href = '/alpha'; return }
      res = (await r.json()) as ChatResponse
    } catch { /* 아래에서 대체 */ }

    if (res?.limit) { setLimit(res.limit); setPending(false); return }
    // 서버의 기계 코드('no_session' 등)는 그대로 보여주지 않는다 (패턴 문서 §20).
    if (!res || res.error || !res.reply) { setNotice('잠시 연결이 끊겼어요. 다시 이어볼까요?'); setPending(false); return }

    // 읽고 나서 답이 오기까지 — 기분에 따라 다르다. 그 사이는 '입력 중'.
    setTyping(true); await sleep(res.delayMs); setTyping(false)
    setItems((xs) => [...xs, withId({ role: 'character', text: res!.reply, at: new Date().toISOString() })])

    if (res.followUp) {
      for (let i = 0; i < res.followUp.lines.length; i++) {
        await sleep(res.followUp.delaysMs[i] ?? 2000)
        setTyping(true); await sleep(900); setTyping(false)
        setItems((xs) => [...xs, withId({ role: 'character', text: res!.followUp!.lines[i]!, at: new Date().toISOString() }, true)])
      }
      fetch('/api/alpha/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'reality_message_seen' }), keepalive: true }).catch(() => {})
    }
    setPending(false)
    if (res.cliffhanger) { await sleep(1600); setCliff(true) }
  }

  return (
    <main id="main" tabIndex={-1} style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', outline: 'none' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 15, display: 'flex', alignItems: 'center', gap: 12, padding: '10px var(--gutter)', background: 'rgba(var(--color-bg-rgb),0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--color-border)' }}>
        <span aria-hidden style={{ width: 36, height: 36, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'var(--color-surface-3)', fontWeight: 700 }}>{YUJIN.name.slice(0, 1)}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="t-title-3 t-name" style={{ lineHeight: 1.2 }}>{YUJIN.name}</h1>
          <p className="t-caption" style={{ color: 'var(--color-text-tertiary)' }}>{typing ? '입력 중…' : '지금 활동 중'}</p>
        </div>
      </header>

      <div style={{ flex: 1, padding: 'var(--space-5) var(--gutter) var(--space-3)' }}>
        <div role="log" aria-live="polite" aria-relevant="additions" aria-label={`${YUJIN.name} 대화`} className="stack" style={{ gap: 'var(--space-4)' }}>
          <AnimatePresence initial={false}>
            {items.map((m) => (
              <Line key={m.id}>
                {m.role === 'user'
                  ? <UserText content={m.text} />
                  : m.reality
                    ? <div data-reality-message style={{ paddingLeft: 12, borderLeft: '2px solid var(--color-accent)' }}><CharacterText content={m.text} name={YUJIN.name} size="lg" /></div>
                    : <CharacterText content={m.text} name={YUJIN.name} />}
              </Line>
            ))}
            {typing && (
              <motion.p key="typing" role="status" className="t-caption t-quote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ color: 'var(--color-text-tertiary)' }}>{YUJIN.name}이(가) 입력 중…</motion.p>
            )}
          </AnimatePresence>
        </div>
        <div ref={bottom} />
      </div>

      {limit ? (
        <section aria-label="오늘의 체험 종료" style={{ position: 'sticky', bottom: 0, padding: 'var(--space-5) var(--gutter) calc(var(--space-5) + env(safe-area-inset-bottom))', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}>
          <p className="t-title-3" style={{ marginBottom: 6 }}>오늘 준비된 Miro 체험이 모두 끝났어요.</p>
          <p className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>사용량이 다시 열리면 이야기를 이어갈 수 있어요.</p>
          <ButtonLink href="/alpha/waitlist" variant="primary" size="lg" full>다음 테스트 초대받기</ButtonLink>
        </section>
      ) : (
        <div style={{ position: 'sticky', bottom: 0, zIndex: 15, background: 'rgba(var(--color-bg-rgb),0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--color-border)', padding: '10px var(--gutter)', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
          {quick && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {YUJIN.quickReplies.map((q) => <Button key={q} type="button" size="sm" onClick={() => send(q)}>{q}</Button>)}
              <Button type="button" size="sm" onClick={() => { setQuick(false); ta.current?.focus() }}>직접 입력하기</Button>
            </div>
          )}
          {notice && <p role="alert" className="t-caption" style={{ color: 'var(--color-text-secondary)', marginBottom: 8 }}>{notice}</p>}
          <form onSubmit={(e) => { e.preventDefault(); send(text) }} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <TextArea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={500} placeholder="메시지 입력" aria-label="메시지 입력" disabled={pending}
              onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px` }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text) } }}
              style={{ resize: 'none', maxHeight: 140, borderRadius: 'var(--radius-md)', padding: '12px 14px' }} />
            <button type="submit" disabled={pending || !text.trim()} aria-label="보내기"
              style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 'var(--radius-md)', border: 0, display: 'grid', placeItems: 'center', cursor: pending || !text.trim() ? 'default' : 'pointer',
                background: text.trim() && !pending ? 'var(--color-white)' : 'var(--color-surface-2)', color: text.trim() && !pending ? 'var(--color-black)' : 'var(--color-text-disabled)' }}>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </form>
        </div>
      )}

      {/* 클리프행어 — 가장 재밌는 순간에 멈춘다. 가입이 아니라 관계를 잇는 말로. */}
      <Sheet open={cliff} onClose={() => setCliff(false)} title={`${YUJIN.name}과의 관계가 아직 저장되지 않았습니다.`}>
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          <p className="t-body" style={{ color: 'var(--color-text-secondary)' }}>지금 나가면 오늘의 대화는 여기서 끊겨요. 정식 Alpha가 열리면 가장 먼저 초대해드릴게요.</p>
          <ButtonLink href="/alpha/waitlist" variant="primary" size="lg" full>이 관계 계속하기</ButtonLink>
          <TransitionLink href="#" onClick={(e) => { e.preventDefault(); setCliff(false) }} className="t-caption" style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>조금만 더 이야기할게요</TransitionLink>
        </div>
      </Sheet>
    </main>
  )
}
