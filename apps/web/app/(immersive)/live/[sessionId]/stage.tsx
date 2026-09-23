'use client'
import { useActionState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button, Pressable, StatusIcon, TextArea } from '@/components/ui'
import { CharacterText, Line } from '@/components/scene/text'
import { tween } from '@/lib/motion/tokens'
import { liveTurn, type LiveState } from './actions'

type LineT = { id: string; role: string; content: string }

export function LiveStage({ sessionId, characterName, background, header, lines }: { sessionId: string; characterName: string; background: string | null; header: React.ReactNode; lines: LineT[] }) {
  const [state, action, pending] = useActionState(liveTurn, { error: null, notice: null } satisfies LiveState)
  const formRef = useRef<HTMLFormElement>(null); const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (!pending && !state.error) formRef.current?.reset() }, [pending, state.error])
  const suggestions = ['가만히 지켜본다.', `"${characterName}…"`, '한 걸음 다가간다.']

  return (
    <main id="main" tabIndex={-1} className="page page--immersive" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', position: 'relative', background: 'var(--color-bg-deep)', outline: 'none' }}>
      {background && (
        <motion.div aria-hidden initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'absolute', inset: 0, backgroundImage: `url(${background})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      <div className="scrim" aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.92) 35%, rgba(0,0,0,0.25))' }} />
      <h1 className="sr-only">{characterName} · <span lang="en">Live Scene</span></h1>
      <header style={{ position: 'relative', padding: 'var(--space-4) var(--space-5)' }}>{header}</header>

      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 var(--gutter) var(--space-3)', gap: 'var(--space-4)', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <AnimatePresence initial={false}>
          {lines.map((m) => (
            <Line key={m.id}>
              {m.role === 'user'
                ? <p className="t-caption" style={{ textAlign: 'right', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>{m.content}</p>
                : <div style={{ textShadow: '0 1px 12px rgba(0,0,0,.7)' }}><CharacterText content={m.content} name={characterName} size="lg" /></div>}
            </Line>
          ))}
        </AnimatePresence>
      </div>

      <div style={{ position: 'relative', padding: '12px var(--space-4)', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <AnimatePresence>
          {pending && <motion.p key="p" role="status" className="t-caption t-quote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 8 }}>장면을 이어가는 중…</motion.p>}
          {state.notice && !pending && <motion.p key="n" role="status" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 8, color: 'var(--color-text-tertiary)' }}>⚠ {state.notice}</motion.p>}
          {state.error && <motion.p key="e" role="alert" className="t-caption" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginBottom: 8, color: 'var(--color-danger)' }}>{state.error}</motion.p>}
        </AnimatePresence>
        {/* 제안은 힌트일 뿐 — 입력창을 채우기만 하고 보내지 않는다. */}
        <div role="group" aria-label="행동 제안" style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {suggestions.map((s) => <Button key={s} type="button" size="sm" variant="ghost" style={{ background: 'rgba(var(--color-bg-rgb),0.5)' }} onClick={() => { if (ta.current) { ta.current.value = s; ta.current.focus() } }}>{s}</Button>)}
        </div>
        <form ref={formRef} action={action} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <TextArea ref={ta} name="input" rows={1} required maxLength={2000} placeholder="무엇을 하시겠어요?" aria-label="행동 입력" style={{ resize: 'none', background: 'rgba(17,17,19,0.85)', borderRadius: 'var(--radius-md)' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit() } }} />
          <Pressable type="submit" disabled={pending} aria-label="행동" style={{ width: 46, height: 46, flexShrink: 0, borderRadius: 'var(--radius-md)', border: 0, background: 'var(--color-white)', color: 'var(--color-black)', display: 'grid', placeItems: 'center' }}>
            {pending ? <StatusIcon status="loading" /> : <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
          </Pressable>
        </form>
      </div>
    </main>
  )
}
