'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { CharacterMedia } from '@miro/config'
import { useT } from '@/lib/i18n/client'
import { spokenText } from '@/lib/voice-text'
import { useTurns } from './turns'
import styles from './chat.module.css'

/**
 * 몰입 모드(10/19): 캐릭터의 답을 그 목소리로 듣고(/api/tts, 없으면 브라우저 읽기) 말로 이어 간다(브라우저 음성 인식).
 * '음성+영상' 유형은 켜면 캐릭터 사진이 화면 전체에 깔린다(립싱크 아님). 켜짐은 이 기기의 방별 기억.
 * 통화가 아니다 — 턴은 그대로 채팅 턴이고, 소리는 저장된 답을 읽는다.
 */
type Immersive = { media: CharacterMedia; on: boolean; toggle: () => void }
const Ctx = createContext<Immersive>({ media: 'text', on: false, toggle: () => {} })
export const useImmersive = () => useContext(Ctx)

// 토글을 누른 손가락으로 재생을 한 번 열어 둔다 — iOS 는 제스처 밖에서 처음 만든 소리를 막는다.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='

export function ImmersiveProvider({ sessionId, media, portrait, children }: { sessionId: string; media: CharacterMedia; portrait?: string | null; children: ReactNode }) {
  const key = `miro:immersive:${sessionId}`
  const [on, setOn] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  // 음성·영상 캐릭터는 처음부터 켜져 있고(10/20), 사용자가 끈 방('0')만 꺼진 채로 연다.
  useEffect(() => { try { setOn(media !== 'text' && localStorage.getItem(key) !== '0') } catch { setOn(media !== 'text') } }, [key, media])
  const toggle = () => {
    const next = !on
    setOn(next)
    try { localStorage.setItem(key, next ? '1' : '0') } catch { /* 이번엔 켜진다 */ }
    if (next) { audio.current ??= new Audio(); audio.current.src = SILENT; audio.current.play().catch(() => {}) }
    else { audio.current?.pause(); window.speechSynthesis?.cancel() }
  }
  return (
    <Ctx.Provider value={{ media, on, toggle }}>
      <div data-immersive={on ? media : undefined} style={{ display: 'contents' }}>
        {on && media === 'video' && portrait && <div aria-hidden className={styles.backdrop} style={{ backgroundImage: `url(${JSON.stringify(portrait)})` }} />}
        {on && <Speaker sessionId={sessionId} audio={audio} />}
        {children}
      </div>
    </Ctx.Provider>
  )
}

/** 방금 저장된 캐릭터 답을 차례로 읽는다. 열 때 이미 있던 글은 읽지 않는다. */
function Speaker({ sessionId, audio }: { sessionId: string; audio: React.MutableRefObject<HTMLAudioElement | null> }) {
  const { appended } = useTurns()
  const spoken = useRef(new Set(appended.map((m) => m.id)))
  const queue = useRef(Promise.resolve())
  useEffect(() => {
    for (const m of appended) {
      if (m.role !== 'character' || spoken.current.has(m.id)) continue
      spoken.current.add(m.id)
      const text = spokenText(m.blocks, m.content)
      if (!text) continue
      queue.current = queue.current.then(() => speak(sessionId, m.id, text, audio)).catch(() => {})
    }
  }, [appended, sessionId, audio])
  useEffect(() => () => { audio.current?.pause(); window.speechSynthesis?.cancel() }, [audio])
  return null
}

async function speak(sessionId: string, messageId: string, text: string, audio: React.MutableRefObject<HTMLAudioElement | null>) {
  const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, messageId }) }).catch(() => null)
  if (res?.status === 200) {
    const url = URL.createObjectURL(await res.blob())
    const el = audio.current ??= new Audio()
    el.src = url
    await new Promise<void>((done) => { el.onended = el.onerror = () => { URL.revokeObjectURL(url); done() }; el.play().catch(() => done()) })
    return
  }
  // ponytail: 서버가 없으면 브라우저 목소리 — 캐릭터 목소리는 아니지만 흐름은 같다. 합성 서버가 서면 자동으로 그쪽.
  const synth = window.speechSynthesis
  if (!synth) return
  await new Promise<void>((done) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = speechLang(); u.onend = u.onerror = () => done()
    synth.speak(u)
  })
}

const speechLang = () => ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' } as Record<string, string>)[document.documentElement.lang] ?? document.documentElement.lang ?? 'ko-KR'

export function ImmersiveToggle() {
  const t = useT()
  const { media, on, toggle } = useImmersive()
  if (media === 'text') return null
  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={t('몰입 모드')} title={t('몰입 모드')} className={styles.contextButton} style={{ color: on ? 'var(--color-accent)' : undefined }}>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="13" width="4.5" height="7" rx="1.6" /><rect x="16.5" y="13" width="4.5" height="7" rx="1.6" />
      </svg>
    </button>
  )
}

type Recognition = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
const recognizer = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** 말로 쓰기 — 몰입 모드가 켜진 방에서만. 말이 끝나면(최종 결과) 그대로 보낸다. 인식이 없는 브라우저(Firefox)는 버튼이 없다. */
export function MicButton({ disabled, onDraft, onSubmit }: { disabled?: boolean; onDraft: (text: string) => void; onSubmit: (text: string) => void }) {
  const t = useT()
  const { on } = useImmersive()
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const [supported, setSupported] = useState(false)
  useEffect(() => { setSupported(!!recognizer()) }, [])
  useEffect(() => () => rec.current?.stop(), [])
  if (!on || !supported) return null
  const start = () => {
    const R = recognizer()
    if (!R) return
    const r = new R()
    r.lang = speechLang(); r.interimResults = true
    let final = ''
    r.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) { text += e.results[i]![0]!.transcript; if (e.results[i]!.isFinal) final = text }
      onDraft(text)
    }
    r.onend = () => { setListening(false); rec.current = null; if (final.trim()) flushSync(() => onSubmit(final.trim())) }
    r.onerror = () => { setListening(false); rec.current = null }
    rec.current = r; r.start(); setListening(true)
  }
  return (
    <button type="button" className={styles.toolButton} aria-label={listening ? t('듣는 중, 누르면 멈춰요') : t('말로 쓰기')} aria-pressed={listening} disabled={disabled}
      onClick={() => (listening ? rec.current?.stop() : start())} style={{ color: listening ? 'var(--color-accent)' : undefined }}>
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  )
}
