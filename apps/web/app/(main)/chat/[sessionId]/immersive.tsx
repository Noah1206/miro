'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { CharacterMedia } from '@miro/config'
import { useT } from '@/lib/i18n/client'
import { useToast } from '@/components/ui'
import { spokenSegments } from '@/lib/voice-text'
import { playVoiceSelection, type VoicePlaybackStatus } from '@/lib/voice-playback'
import { VoiceStreamPlayer } from '@/lib/voice-stream'
import { sfxClips, voicedClip } from '@/lib/voice-sfx'
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
type Immersive = { media: CharacterMedia; available:boolean; soon:boolean; on: boolean;
  /** 11/16 글·음성 맞추기: 음성이 아직 시작되지 않은 새 답 — 화면이 그 글을 잡아 뒀다가 소리와 같이 보여 준다. */
  held:(id:string)=>boolean; holding:boolean; toggle: () => void; status: VoicePlaybackStatus; retry: () => void;
  choices:SpeechChoice[];listen:(choice:SpeechChoice,amount:'standard'|'extended',reuseOnly?:boolean)=>Promise<boolean>;stop:()=>void;sessionId:string
  /** 11/6: 무료 운영(음성 분량 차감 꺼짐) — 새 답 이어 읽기·말풍선 눌러 다시 듣기. */
  free:boolean;replay:(m:Msg,texts:string[])=>void
  /** 11/11 음성 모드로 이어 읽는 중 — 폼에 voice=1(답을 쓰는 동안 합성 서버를 깨운다). */
  live:boolean
  /** 11/22 보낼 때 음성이 켜져 있었나 — 꺼진 채 보낸 턴의 답은 도중에 음성을 켜도 읽지 않는다(그 답은 신음 태그 없이 만들어졌다). */
  markSend:(voiced:boolean)=>void
  /** 11/24 음성이 켜진 방에서 곧 쓸 것 같을 때(글을 쓰기 시작·보내기) 서버를 깨운다 — 2분에 한 번만 실제로 나간다. */
  wake:()=>void }
const Ctx = createContext<Immersive>({ media: 'text', available:false, soon:false, on: false, held:()=>false, holding:false, toggle: () => {}, status: 'idle', retry: () => {},choices:[],listen:async()=>false,stop:()=>{},sessionId:'',free:false,replay:()=>{},markSend:()=>{},wake:()=>{},live:false })
export const useImmersive = () => useContext(Ctx)

// 토글을 누른 손가락으로 재생을 한 번 열어 둔다 — iOS 는 제스처 밖에서 처음 만든 소리를 막는다.
const SILENT = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export function ImmersiveProvider({ sessionId, media, portrait, children, initialMessages=[], characterName, voiceSpeakers=[], enabled=false, soon=false, adult=false }: { sessionId: string; media: CharacterMedia; portrait?: string | null; children: ReactNode; initialMessages?:Msg[];characterName?:string
  /** 히로인별 목소리가 있는 이름(11/4) — 서버(lib/speech/access)와 같은 목록이어야 part 번호가 맞는다. */
  voiceSpeakers?:string[];enabled?:boolean;
  /** 11/23 사용자: 일상 대화에 빠는 소리가 났다 — 효과음(살·빠는·헛구역질)은 언베일 켠 방에서만. */
  adult?:boolean
  /** 11/12 음성 서버가 멈춰 있는 동안(MIRO_VOICE_PAUSED=1) — 켤 수 없고 방 메뉴에 '곧 열림' 으로만 보인다. */
  soon?:boolean }) {
  const key = `miro:immersive:${sessionId}`
  const [preferredOn, setOn] = useState(false)
  const on=enabled&&preferredOn
  const audio = useRef<HTMLAudioElement | null>(null)
  const [status, setStatus] = useState<VoicePlaybackStatus>('idle')
  const toast=useToast(),busyNoticed=useRef(false),t=useT()
  const {appended,live:liveTurn,playbackKeys}=useTurns()
  const controller=useRef<AbortController|null>(null)
  useEffect(()=>{if(!enabled){controller.current?.abort();audio.current?.pause();setStatus('idle')}},[enabled])
  // 11/4: 인트로 대사는 블록 없이 글만 있다 — 그것도 고를 수 있게(서버 spokenSegments 도 글만 있으면 그 글을 읽는다).
  const known=new Set(initialMessages.map(m=>m.id))
  const choices=[...initialMessages,...appended.filter(m=>!known.has(m.id))].filter(m=>m.role==='character'&&m.kind==='text'&&(m.blocks.length||m.content.trim())&&/^[0-9a-f-]{36}$/i.test(m.id))
    .reverse().flatMap(m=>spokenSegments(m.blocks,m.content,characterName,voiceSpeakers).map((s,part)=>({messageId:m.id,part,text:s.text}))).slice(0,3)
  // 11/6 이어 읽기: 읽을 답을 줄 세워 끝까지 읽는다 — 읽는 중에 새 답이 와도 끊지 않고 뒤에 붙는다.
  type Job={key:string;id:string;parts:number[]|null;early?:boolean}
  // 11/23 첫 대사 미리 읽기(early) — 소리가 시작된 턴(playbackId). 그 턴은 오고 있는 글을 바로 보여 주고, 저장본도 가리지 않는다.
  const [earlyStarted,setEarlyStarted]=useState<string|null>(null)
  const earlyAsked=useRef(new Set<string>())
  const queue=useRef<Job[]>([])
  const current=useRef<string|null>(null)
  const player=useRef<VoiceStreamPlayer|null>(null)
  const lastVoice=useRef<string|null>(null)
  const latest=useRef<Msg[]>([]);latest.current=[...initialMessages,...appended.filter(m=>!known.has(m.id))]
  // 11/16 글·음성 맞추기 — released: 소리가 시작됐거나(또는 실패·중단·30초 초과) 글을 보여도 되는 답, skipped: 음성 모드를 켜기 전에 와 있던 답.
  const [released,setReleased]=useState<ReadonlySet<string>>(new Set())
  const [skipped,setSkipped]=useState<ReadonlySet<string>>(new Set())
  const release=(id:string)=>setReleased(prev=>prev.has(id)?prev:new Set([...prev,id]))
  const releaseAll=()=>setReleased(prev=>new Set([...prev,...latest.current.map(m=>m.id)]))
  const stop=()=>{queue.current=[];controller.current?.abort();audio.current?.pause();player.current?.stop();setStatus('idle');releaseAll()}
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
    // 11/24 사용자: 음성이 실제로 나왔는지 기록으로 확인하고 싶다 — 기기에서 첫 소리가 재생 줄에 올라간 순간을 서버에 알린다(소리판 상태 포함, 글·목소리 값은 보내지 않음).
    const heard=(of:string)=>{void fetch('/api/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({played:true,of,sessionId,audio:player.current?.state??'none'}),keepalive:true}).catch(()=>{})}
    const one=async(body:object,pause:number,started?:()=>void)=>{
      if(current.current===null)return
      report('preparing')
      const res=await post(body)
      if(res.status===204)return   // 11/23 읽을 게 남지 않았다(첫 줄을 미리 읽었고 그게 전부)
      lastVoice.current=res.headers.get('x-voice')   // 11/23 히로인 목소리 — 빠는 소리를 그 목소리 판으로
      // 11/18 음성 서버가 바쁘면(503 voice_busy) 기다리지 않는다 — 글은 바로 보이고, 안내는 방마다 한 번.
      if(res.status===503&&(await res.clone().json().catch(()=>null))?.error==='voice_busy'&&!busyNoticed.current){busyNoticed.current=true;toast(t('지금 목소리를 듣는 사람이 많아요. 이번 답은 글로 먼저 보여 드려요'))}
      if(!res.ok||!res.headers.get('content-type')?.startsWith('audio/'))throw new Error('voice_generation_failed')
      const fed=await player.current!.feed(res,active.signal,()=>{report('playing');heard('turn' in body?'turn':'part');started?.()})
      ended=fed.ended;player.current!.gap(Math.max(0,Math.min(1500,pause)))
    }
    try{
      while(queue.current.length&&!active.signal.aborted){
        const job=queue.current.shift()!;current.current=job.key
        try{
          if(job.early){
            // 11/23 사용자 "음성 모드일 때 너무 오래 걸려": 첫 줄만 미리 읽고 나머지는 답이 저장된 뒤에야 읽어 그 사이(20~40초)가 침묵이었다 —
            // 답이 만들어지는 동안 완성된 대사·속마음이 늘 때마다 이어서 부른다. 앞 소리를 다 받으면(재생이 끝나길 기다리지 않고) 바로 다음을 불러 소리가 끊기지 않게 한다.
            // 답이 저장되면(진행 중 턴이 사라지면) 멈추고, 남은 줄은 뒤에 선 한 턴 요청이 읽는다(서버가 이미 읽은 줄을 뺀다).
            const spokenDone=()=>{const l=liveRef.current;return l?.playbackId===job.id?l.blocks.filter(b=>b.partial!==true&&(b.type==='dialogue'||b.type==='thought')).length:-1}
            // 11/23 사용자: 이어 읽는 줄에도 효과음 — 지금까지 다 쓴 서술·행동으로 고른다(저장 뒤 한 턴 요청과 같은 규칙). 오랄이면 서버가 그 목소리의 빠는 소리를
            // 문장 사이에 끼우고(oral), 그 목소리 판이 없거나 살 부딪는 소리·헛구역질이면 밑에 깐다. 깔 소리가 바뀌면 바꿔 깔고, 마지막 소리가 끝나면 끈다.
            let sent=0,bed:(()=>void)|null=null,bedKey=''
            try{
              for(const until=Date.now()+300_000;!active.signal.aborted&&Date.now()<until;){
                const n=spokenDone()
                if(n<0)break
                if(n<sent)sent=0   // 답을 처음부터 다시 쓰는 중(블록이 비워짐) — 다시 센다
                if(n<=sent){await new Promise(r=>setTimeout(r,250));continue}
                if(!sent)report('preparing')
                const all=adult?sfxClips((liveRef.current?.blocks??[]).filter(b=>b.partial!==true)):[],oral=all.includes('/sfx/suck.mp3'),clips=oral?all.filter(c=>c!=='/sfx/suck.mp3'):all
                const res=await post({early:true,...(oral?{oral:true}:{})})
                if(res.ok&&res.headers.get('content-type')?.startsWith('audio/')){
                  lastVoice.current=res.headers.get('x-voice')
                  const fed=await player.current!.feed(res,active.signal,()=>{
                    report('playing');heard('early');setEarlyStarted(job.id)
                    const bedClips=oral&&!voicedClip('/sfx/suck.mp3',lastVoice.current).includes('suck-')?[...clips,'/sfx/suck.mp3']:clips,key=bedClips.join()
                    if(key!==bedKey){bed?.();bedKey=key;bed=bedClips.length?player.current!.bed(bedClips,bedClips.some(c=>/suck|gag/.test(c))?0.6:0.35):null}
                  })
                  ended=fed.ended
                }
                else if(res.status!==204)break   // 바쁨·한도·실패 — 미리 읽기는 그만두고 저장 뒤 한 턴 요청에 맡긴다
                sent=n
              }
            }finally{const end=bed as (()=>void)|null;if(end)void ended.then(end)}
            continue
          }
          const m=latest.current.find(x=>x.id===job.id);if(!m)continue
          // 11/17 서술의 젖은 소리는 음성 엔진이 못 낸다 — 이 답을 읽는 동안 효과음을 밑에 깐다(lib/voice-sfx).
          if(job.parts===null){const all=adult?sfxClips(m.blocks):[],oral=all.includes('/sfx/suck.mp3'),clips=oral?all.filter(c=>c!=='/sfx/suck.mp3'):all;let bed:(()=>void)|null=null
            // 11/23 오랄 턴은 서버가 그 목소리로 입힌 빠는 소리를 문장 사이에 직접 끼운다(oral) — 밑에 깔지 않는다. 그 목소리 판이 없으면 서버가 안 끼우므로 예전처럼 깐다.
            try{await one({messageId:m.id,turn:true,...(oral?{oral:true}:{})},0,()=>{release(m.id);const bedClips=oral&&!voicedClip('/sfx/suck.mp3',lastVoice.current).includes('suck-')?[...clips,'/sfx/suck.mp3']:clips;if(bedClips.length)bed=player.current!.bed(bedClips,bedClips.some(c=>/suck|gag/.test(c))?0.6:0.35)})}finally{release(m.id);const end=bed;if(end)void ended.then(end)};continue}
          const segs=spokenSegments(m.blocks,m.content,characterName,voiceSpeakers)
          for(const part of (job.parts??segs.map((_,i)=>i)).filter(p=>segs[p])){
            try{await one({messageId:m.id,part,amount:'standard',confirmed:true},segs[part]!.delivery.pauseAfterMs??0)}
            catch(e){if(active.signal.aborted)throw e;setStatus('error')}   // 한 묶음이 실패해도 나머지는 계속 읽는다
          }
        }catch(e){if(active.signal.aborted)throw e;setStatus('error')}
      }
      await ended;if(controller.current===active&&!active.signal.aborted)setStatus('idle')
    }catch{/* 음성 모드를 끄거나 방을 나감 */}
    // 11/17 마지막 소리가 끝나길 기다리는 동안 들어온 답은 줄에만 서고 읽히지 않았다(위 반복문은 이미 끝났고, enqueue 의 drain 은 읽는 중이라 바로 돌아간다) — 끝나면 남은 줄을 이어 읽는다.
    finally{current.current=null;if(queue.current.length&&!active.signal.aborted)void drain()}
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
    if(parts===null)setTimeout(()=>release(id),30_000)   // 소리가 끝내 안 와도 글은 보여 준다
  }

  useEffect(()=>()=>{controller.current?.abort();audio.current?.pause()},[sessionId])
  // 11/6: 음성 모드가 켜지면(토글·다시 들어옴) 서버를 미리 깨운다 — 대사를 누를 때 켜지는 시간을 기다리지 않게.
  // 11/24 사용자(Modal 비용을 최대한 아끼며 빠르게): 음성이 꺼진 방에 들어올 때는 더 깨우지 않는다(11/23엔 음성을 써 본 사람이면 깨웠다 — 그날 방 깨우기 26번 중 대부분이 음성 없이 끝났다).
  // 대신 음성이 켜진 방에서 '곧 쓸 때'만 깨운다 — 들어올 때·켤 때(아래), 글을 쓰기 시작할 때·보낼 때(wake). 서버가 꺼져 있으면 켜지는 데 약 30초라, 글 쓰는 시간과 답이 만들어지는 시간에 겹쳐 둔다.
  const lastWake=useRef(0)
  const sendWake=()=>{lastWake.current=Date.now();void fetch('/api/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({wake:true,sessionId}),keepalive:true}).catch(()=>{})}
  const wake=()=>{if(on&&!soon&&Date.now()-lastWake.current>120_000)sendWake()}
  // 11/24 사용자: 토글을 끄거나 브라우저를 닫으면 Modal 을 유지하지 않는다 — 끌 때·방을 나갈 때·탭을 닫을 때 서버에 알린다(탭이 닫히는 중에도 가도록 sendBeacon).
  const leave=()=>{lastWake.current=0;const body=JSON.stringify({leave:true})
    try{if(!navigator.sendBeacon('/api/tts',new Blob([body],{type:'application/json'})))throw new Error('beacon')}
    catch{void fetch('/api/tts',{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{})}}
  useEffect(()=>{
    if(!on)return
    window.addEventListener('pagehide',leave)
    return()=>{window.removeEventListener('pagehide',leave);leave()}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[on,sessionId])
  useEffect(()=>{if(on&&!soon)sendWake()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[on,sessionId,soon])
  // 11/19 음성 모드가 켜져 있고 화면이 보이는 동안 1분마다 '아직 듣는 중' — 신호가 끊기면 서버가 몇 분 안에 꺼진다(api/tts route).
  useEffect(()=>{
    if(!on)return
    const beat=()=>{if(document.visibilityState==='visible')void fetch('/api/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({beat:true}),keepalive:true}).catch(()=>{})}
    const id=setInterval(beat,60_000)
    document.addEventListener('visibilitychange',beat)
    return()=>{clearInterval(id);document.removeEventListener('visibilitychange',beat)}
  },[on])
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
  // 11/22 사용자: 답이 만들어지는 도중에 음성을 켜면 그 답은 글로만, 다음 답부터 음성 — 보낼 때 음성 상태로 가른다(서버도 그 값으로 음성용 답을 만든다).
  const voiceAtSend=useRef(false)
  // 11/23 음성 모드는 새로고침해도 켜진 채라(localStorage) 소리 잠금 풀기(unlock)가 켤 때만 있었다 — iOS 는 손짓 밖에서 만든 소리판이 멈춰 있어 아무 소리도 안 나고 줄이 멈췄다. 보내기(손짓)에서 푼다.
  const markSend=(voiced:boolean)=>{voiceAtSend.current=voiced;if(voiced&&on){unlock();wake()}}
  // 켜는 순간 이미 와 있던 답은 읽지 않는다 — 켠 뒤에 새로 오는 답부터.
  const spoken=useRef(new Set<string>())
  useEffect(()=>{if(on){for(const m of appended)spoken.current.add(m.id);setSkipped(new Set(appended.map(m=>m.id)))}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[on])
  const arrived=appended.filter(m=>!known.has(m.id)&&m.role==='character'&&m.kind==='text'&&(m.blocks.length||m.content.trim())&&/^[0-9a-f-]{36}$/i.test(m.id))
  useEffect(()=>{
    if(!on||!enabled||free!==true)return
    const quietIds:string[]=[]
    for(const m of arrived)if(!spoken.current.has(m.id)){spoken.current.add(m.id);if(voiceAtSend.current)enqueue(m.id,null);else quietIds.push(m.id)}
    if(quietIds.length)setSkipped(prev=>new Set([...prev,...quietIds]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[on,enabled,free,arrived.map(m=>m.id).join()])
  const liveVoice=on&&enabled&&free===true
  // 11/23 사용자 "답마다 음성이 늦게 나와": 답이 다 만들어지길(20~70초) 기다리지 않고, 오고 있는 답에 첫 대사가 완성되면(뒤에 블록이 하나 더 왔으면) 그 줄부터 읽는다.
  const livePid=liveTurn?.playbackId
  const liveRef=useRef(liveTurn);liveRef.current=liveTurn
  useEffect(()=>{
    if(!liveVoice||!voiceAtSend.current||!livePid||earlyAsked.current.has(livePid))return
    // 쓰는 중인 블록(partial)은 빼고, 다 쓴 대사·속마음이 하나라도 생기면 시작한다(속마음도 말과 같은 소리로 순서대로 읽는다).
    if(!(liveTurn?.blocks??[]).some(b=>b.partial!==true&&(b.type==='dialogue'||b.type==='thought')))return
    earlyAsked.current.add(livePid)
    queue.current.push({key:`early:${livePid}`,id:livePid,parts:null,early:true});void drain()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[liveVoice,livePid,liveTurn?.blocks.length])
  // 11/24 사용자 "음성 모드가 더 느린 것 같다": 글은 소리가 시작될 때까지 잡아 두는데(11/16), 서버가 꺼져 있다 켜지는 턴(약 30초)이나 서술로 길게 시작하는 답은 그동안 빈 화면이었다 —
  // 답의 첫 글이 온 뒤 7초 안에 소리가 시작되지 않으면 글부터 보여 준다(소리는 준비되는 대로 뒤따른다). 서버가 켜져 있을 땐 첫 소리가 2~5초 안이라 전처럼 같이 나온다.
  const textCap=useRef(new Set<string>())
  useEffect(()=>{
    if(!liveVoice||!voiceAtSend.current||!livePid||textCap.current.has(livePid)||!(liveTurn?.blocks.length))return
    textCap.current.add(livePid)
    // 정리 함수로 끄지 않는다 — 답을 다시 쓰는 턴(블록이 비워졌다 다시 옴)에도 처음 건 시간이 그대로 가야 한다. 턴이 끝난 뒤 울려도 그 턴의 글을 보이게 할 뿐이다.
    setTimeout(()=>setEarlyStarted(prev=>prev===livePid?prev:livePid),7_000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[liveVoice,livePid,!!liveTurn?.blocks.length])
  const earlyFor=(id:string)=>!!earlyStarted&&!!playbackKeys.get(id)?.startsWith(`${earlyStarted}:`)
  const arrivedIds=new Set(arrived.map(m=>m.id))
  const held=(id:string)=>liveVoice&&voiceAtSend.current&&arrivedIds.has(id)&&!skipped.has(id)&&!released.has(id)&&!earlyFor(id)
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
    <Ctx.Provider value={{ media, available:enabled, soon, on, held, holding:arrived.some(m=>held(m.id)), toggle, status, retry:()=>{},choices,listen,stop,sessionId,free:free===true,replay,markSend,wake,live:liveVoice&&!(earlyStarted&&livePid===earlyStarted) }}>
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
  // 11/12 사용자: 헤더 밑 안내 줄은 없앰 — 켤 때 토스트(room-menu)로만 알린다.
  if(voice.on&&voice.free)return null
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
