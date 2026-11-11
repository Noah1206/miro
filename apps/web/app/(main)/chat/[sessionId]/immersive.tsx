'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { CharacterMedia } from '@miro/config'
import { useT } from '@/lib/i18n/client'
import { spokenSegments } from '@/lib/voice-text'
import { playVoiceSelection, type VoicePlaybackStatus } from '@/lib/voice-playback'
import { VoiceStreamPlayer } from '@/lib/voice-stream'
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
  choices:SpeechChoice[];listen:(choice:SpeechChoice,amount:'standard'|'extended',reuseOnly?:boolean)=>Promise<boolean>;stop:()=>void;sessionId:string
  /** 11/6: 무료 운영(음성 분량 차감 꺼짐) — 새 답 이어 읽기·말풍선 눌러 다시 듣기. */
  free:boolean;replay:(m:Msg,texts:string[])=>void
  /** 11/11 음성 모드로 이어 읽는 중 — 폼에 voice=1(답을 쓰는 동안 합성 서버를 깨운다). */
  live:boolean }
const Ctx = createContext<Immersive>({ media: 'text', available:false, on: false, toggle: () => {}, status: 'idle', retry: () => {},choices:[],listen:async()=>false,stop:()=>{},sessionId:'',free:false,replay:()=>{},live:false })
export const useImmersive = () => useContext(Ctx)

// 토글을 누른 손가락으로 재생을 한 번 열어 둔다 — iOS 는 제스처 밖에서 처음 만든 소리를 막는다.
const SILENT = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export function ImmersiveProvider({ sessionId, media, portrait, children, initialMessages=[], characterName, voiceSpeakers=[], enabled=false }: { sessionId: string; media: CharacterMedia; portrait?: string | null; children: ReactNode; initialMessages?:Msg[];characterName?:string
  /** 히로인별 목소리가 있는 이름(11/4) — 서버(lib/speech/access)와 같은 목록이어야 part 번호가 맞는다. */
  voiceSpeakers?:string[];enabled?:boolean }) {
  const key = `miro:immersive:${sessionId}`
  const [preferredOn, setOn] = useState(false)
  const on=enabled&&preferredOn
  const audio = useRef<HTMLAudioElement | null>(null)
  const [status, setStatus] = useState<VoicePlaybackStatus>('idle')
  const {appended}=useTurns()
  const controller=useRef<AbortController|null>(null)
  useEffect(()=>{if(!enabled){controller.current?.abort();audio.current?.pause();setStatus('idle')}},[enabled])
  // 11/4: 인트로 대사는 블록 없이 글만 있다 — 그것도 고를 수 있게(서버 spokenSegments 도 글만 있으면 그 글을 읽는다).
  const known=new Set(initialMessages.map(m=>m.id))
  const choices=[...initialMessages,...appended.filter(m=>!known.has(m.id))].filter(m=>m.role==='character'&&m.kind==='text'&&(m.blocks.length||m.content.trim())&&/^[0-9a-f-]{36}$/i.test(m.id))
    .reverse().flatMap(m=>spokenSegments(m.blocks,m.content,characterName,voiceSpeakers).map((s,part)=>({messageId:m.id,part,text:s.text}))).slice(0,3)
  // 11/6 이어 읽기: 읽을 답을 줄 세워 끝까지 읽는다 — 읽는 중에 새 답이 와도 끊지 않고 뒤에 붙는다.
  type Job={key:string;id:string;parts:number[]|null}
  const queue=useRef<Job[]>([])
  const current=useRef<string|null>(null)
  const player=useRef<VoiceStreamPlayer|null>(null)
  const latest=useRef<Msg[]>([]);latest.current=[...initialMessages,...appended.filter(m=>!known.has(m.id))]
  const stop=()=>{queue.current=[];controller.current?.abort();audio.current?.pause();player.current?.stop();setStatus('idle')}
  /**
   * 11/11 만드는 대로 듣기: /api/tts 를 stream 으로 받아 오는 조각부터 재생한다. 새 답은 한 턴 통째(turn) — 서버가 목소리마다 한 번에 합성해
   * 대화 순서대로 흘려보낸다(사용자: 묶음이 아니라 1턴당). 말풍선 다시 듣기는 그 묶음만, 다 받으면 다음 묶음을 재생 시각 뒤에 붙인다.
   */
  const drain=async()=>{
    if(current.current!==null)return
    const active=new AbortController();controller.current=active
    player.current??=new VoiceStreamPlayer()
    const report=(v:VoicePlaybackStatus)=>{if(controller.current===active)setStatus(v)}
    let ended:Promise<void>=Promise.resolve()
    const post=(body:object)=>fetch('/api/tts',{method:'POST',signal:active.signal,headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,stream:true,...body})})
    const one=async(body:object,pause:number)=>{
      if(current.current===null)return
      report('preparing')
      const res=await post(body)
      if(!res.ok||!res.headers.get('content-type')?.startsWith('audio/'))throw new Error('voice_generation_failed')
      const fed=await player.current!.feed(res,active.signal,()=>report('playing'))
      ended=fed.ended;player.current!.gap(Math.max(0,Math.min(1500,pause)))
    }
    try{
      while(queue.current.length&&!active.signal.aborted){
        const job=queue.current.shift()!;current.current=job.key
        try{
          const m=latest.current.find(x=>x.id===job.id);if(!m)continue
          if(job.parts===null){await one({messageId:m.id,turn:true},0);continue}
          const segs=spokenSegments(m.blocks,m.content,characterName,voiceSpeakers)
          for(const part of (job.parts??segs.map((_,i)=>i)).filter(p=>segs[p])){
            try{await one({messageId:m.id,part,amount:'standard',confirmed:true},segs[part]!.delivery.pauseAfterMs??0)}
            catch(e){if(active.signal.aborted)throw e;setStatus('error')}   // 한 묶음이 실패해도 나머지는 계속 읽는다
          }
        }catch(e){if(active.signal.aborted)throw e;setStatus('error')}
      }
      await ended;if(controller.current===active&&!active.signal.aborted)setStatus('idle')
    }catch{/* 음성 모드를 끄거나 방을 나감 */}
    finally{current.current=null}
  }
  // 음성 분량 차감이 켜진 운영(유료)에선 저절로 읽지 않는다 — 지금처럼 골라 듣는 패널(묻지 않고 차감하지 않게).
  const [free,setFree]=useState<boolean|null>(null)
  useEffect(()=>{if(!on)return;setFree(null);const a=new AbortController()
    void fetch('/api/tts/credits',{cache:'no-store',signal:a.signal}).then(r=>r.ok?r.json():null).then((b:{enabled?:boolean}|null)=>setFree(!!b&&!b.enabled)).catch(()=>{})
    return()=>a.abort()},[on])
  const enqueue=(id:string,parts:number[]|null)=>{
    const key=`${id}:${parts?.join(',')??'all'}`
    if(current.current===key||queue.current.some(j=>j.key===key))return
    queue.current.push({id,parts,key});void drain()
  }

  useEffect(()=>()=>{controller.current?.abort();audio.current?.pause()},[sessionId])
  // 11/6: 음성 모드가 켜지면(토글·다시 들어옴) 서버를 미리 깨운다 — 대사를 누를 때 켜지는 시간을 기다리지 않게.
  useEffect(()=>{if(on)void fetch('/api/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({wake:true,sessionId}),keepalive:true}).catch(()=>{})},[on,sessionId])
  // Voice is opt-in for every character, including those originally created as text.
  useEffect(() => { try { setOn(localStorage.getItem(key) === '1') } catch { setOn(false) } }, [key])
  const unlock = () => { audio.current ??= new Audio(); audio.current.src = SILENT; audio.current.play().catch(() => {}); (player.current ??= new VoiceStreamPlayer()).unlock() }
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
  // 켜는 순간 이미 와 있던 답은 읽지 않는다 — 켠 뒤에 새로 오는 답부터.
  const spoken=useRef(new Set<string>())
  useEffect(()=>{if(on)for(const m of appended)spoken.current.add(m.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[on])
  const arrived=appended.filter(m=>!known.has(m.id)&&m.role==='character'&&m.kind==='text'&&(m.blocks.length||m.content.trim())&&/^[0-9a-f-]{36}$/i.test(m.id))
  useEffect(()=>{
    if(!on||!enabled||free!==true)return
    for(const m of arrived)if(!spoken.current.has(m.id)){spoken.current.add(m.id);enqueue(m.id,null)}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[on,enabled,free,arrived.map(m=>m.id).join()])
  /** 말풍선을 누르면 그 말풍선의 대사를 다시 읽는다(줄 끝에 붙는다). texts = 그 말풍선에 든 대사 문단. */
  const replay=(m:Msg,texts:string[])=>{
    if(!on||!enabled||free!==true||!/^[0-9a-f-]{36}$/i.test(m.id))return
    const segs=spokenSegments(m.blocks,m.content,characterName,voiceSpeakers)
    const said=texts.map(x=>x.trim()).filter(Boolean)
    // 블록 없는 옛 기록·인트로는 글 전체가 한 줄이다.
    const parts=!m.blocks.length?(segs.length&&said.length?[0]:[]):segs.flatMap((s,i)=>said.some(x=>s.lines.some(l=>x===l||x.startsWith(l)))?[i]:[])
    if(!parts.length)return
    if(current.current===null)unlock()
    enqueue(m.id,parts)
  }
  return (
    <Ctx.Provider value={{ media, available:enabled, on, toggle, status, retry:()=>{},choices,listen,stop,sessionId,free:free===true,replay,live:on&&enabled&&free===true }}>
      <div data-immersive={on ? media : undefined} style={{ display: 'contents' }}>
        {on && media === 'video' && portrait && <div aria-hidden className={styles.backdrop} style={{ backgroundImage: `url(${JSON.stringify(portrait)})` }} />}
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function VoiceStatus() {
  const t=useT(),voice=useImmersive()
  // 무료 운영: 고르는 패널 대신 한 줄 — 새 답은 저절로 읽고, 다시 들으려면 말풍선을 누른다.
  if(voice.on&&voice.free)return <p className={styles.voiceHint} role="status">
    {t(voice.status==='preparing'?'음성 준비 중…':voice.status==='playing'?'읽는 중':voice.status==='error'?'음성을 읽지 못했어요':'새 답은 저절로 읽어요 · 말풍선을 누르면 다시 들어요')}</p>
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
