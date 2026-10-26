'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { CharacterMedia } from '@miro/config'
import { useT } from '@/lib/i18n/client'
import { spokenSegments } from '@/lib/voice-text'
import { playVoiceSelection, type VoicePlaybackStatus } from '@/lib/voice-playback'
import { useTurns } from './turns'
import type { Msg } from './messages'
import { SpeechPanel } from './speech-panel'
import styles from './chat.module.css'

/**
 * 음성 모드: 확정된 대사를 대사별 연출·쉼과 함께 재생한다. 실패 시 다른 목소리로 대체하지 않는다.
 * '음성+영상' 유형은 켜면 캐릭터 사진이 화면 전체에 깔린다(립싱크 아님). 켜짐은 이 기기의 방별 기억.
 * 통화가 아니다 — 턴은 그대로 채팅 턴이고, 소리는 저장된 답을 읽는다.
 */
export type SpeechChoice={messageId:string;part:number;text:string}
type Immersive = { media: CharacterMedia; available:boolean; on: boolean; toggle: () => void; status: VoicePlaybackStatus; retry: () => void;
  choices:SpeechChoice[];listen:(choice:SpeechChoice,amount:'standard'|'extended',reuseOnly?:boolean)=>Promise<boolean>;stop:()=>void;sessionId:string }
const Ctx = createContext<Immersive>({ media: 'text', available:false, on: false, toggle: () => {}, status: 'idle', retry: () => {},choices:[],listen:async()=>false,stop:()=>{},sessionId:'' })
export const useImmersive = () => useContext(Ctx)

// 토글을 누른 손가락으로 재생을 한 번 열어 둔다 — iOS 는 제스처 밖에서 처음 만든 소리를 막는다.
const SILENT = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export function ImmersiveProvider({ sessionId, media, portrait, children, initialMessages=[], characterName, enabled=false }: { sessionId: string; media: CharacterMedia; portrait?: string | null; children: ReactNode; initialMessages?:Msg[];characterName?:string;enabled?:boolean }) {
  const key = `miro:immersive:${sessionId}`
  const [preferredOn, setOn] = useState(false)
  const on=enabled&&preferredOn
  const audio = useRef<HTMLAudioElement | null>(null)
  const [status, setStatus] = useState<VoicePlaybackStatus>('idle')
  const {appended}=useTurns()
  const controller=useRef<AbortController|null>(null)
  useEffect(()=>{if(!enabled){controller.current?.abort();audio.current?.pause();setStatus('idle')}},[enabled])
  const known=new Set(initialMessages.map(m=>m.id))
  const choices=[...initialMessages,...appended.filter(m=>!known.has(m.id))].filter(m=>m.role==='character'&&m.kind==='text'&&m.blocks.length&&/^[0-9a-f-]{36}$/i.test(m.id))
    .reverse().flatMap(m=>spokenSegments(m.blocks,m.content,characterName).map((s,part)=>({messageId:m.id,part,text:s.text}))).slice(0,3)
  const stop=()=>{controller.current?.abort();audio.current?.pause();setStatus('idle')}
  useEffect(()=>()=>{controller.current?.abort();audio.current?.pause()},[sessionId])
  // Voice is opt-in for every character, including those originally created as text.
  useEffect(() => { try { setOn(localStorage.getItem(key) === '1') } catch { setOn(false) } }, [key])
  const unlock = () => { audio.current ??= new Audio(); audio.current.src = SILENT; audio.current.play().catch(() => {}) }
  const toggle = () => {
    if(!enabled)return
    const next = !on
    setOn(next)
    try { localStorage.setItem(key, next ? '1' : '0') } catch { /* 이번엔 켜진다 */ }
    if (next) unlock()
    else stop()
  }
  const listen=async(choice:SpeechChoice,amount:'standard'|'extended',reuseOnly=false)=>{
    if(!enabled)return false
    stop();unlock();const active=new AbortController();controller.current=active
    try { await playVoiceSelection(sessionId,choice.messageId,choice.part,amount,audio.current!,active.signal,
      value=>{if(controller.current===active)setStatus(value)},reuseOnly);return true }
    catch {if(!active.signal.aborted)setStatus('error');return false}
  }
  return (
    <Ctx.Provider value={{ media, available:enabled, on, toggle, status, retry:()=>{},choices,listen,stop,sessionId }}>
      <div data-immersive={on ? media : undefined} style={{ display: 'contents' }}>
        {on && media === 'video' && portrait && <div aria-hidden className={styles.backdrop} style={{ backgroundImage: `url(${JSON.stringify(portrait)})` }} />}
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function VoiceStatus() {
  return <SpeechPanel/>
}

const speechLang = () => ({ ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' } as Record<string, string>)[document.documentElement.lang] ?? document.documentElement.lang ?? 'ko-KR'

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
