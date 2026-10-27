'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/client'
import { useImmersive, type SpeechChoice } from './immersive'
import styles from './speech-panel.module.css'
import { useWallet } from '@/components/wallet/provider'
type Balance={enabled:boolean;remainingSeconds:number;reservedSeconds:number;products:Array<{id:string;seconds:number;units:number}>}
type Quote=Balance&{maximumSeconds:number;cached:boolean;canGenerate:boolean;existingState:string|null}
export function SpeechPanel() {
  const t=useT(),voice=useImmersive(),router=useRouter()
  const {refreshBalance}=useWallet()
  const [balance,setBalance]=useState<Balance|null>(null),[amount,setAmount]=useState<'standard'|'extended'>('standard')
  const [selected,setSelected]=useState<SpeechChoice|null>(null),[quote,setQuote]=useState<Quote|null>(null)
  const [notice,setNotice]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const sequence=useRef(0),purchase=useRef<{product:string;id:string}|null>(null)
  const refresh=async(signal?:AbortSignal)=>{
    const res=await fetch('/api/tts/credits',{cache:'no-store',signal})
    if(!res.ok)throw new Error('balance_unavailable')
    setBalance(await res.json())
  }
  useEffect(()=>{
    sequence.current++;setSelected(null);setQuote(null);setNotice(null);setError('');setBalance(null)
    if(!voice.on)return
    const active=new AbortController();void refresh(active.signal).catch(()=>{if(!active.signal.aborted)setError('잔여량을 불러오지 못했어요.')})
    return ()=>active.abort()
  },[voice.on,voice.sessionId])
  if(!voice.on)return null
  const working=busy||voice.status==='preparing'||voice.status==='playing'
  const choose=async(choice:SpeechChoice)=>{
    voice.stop()
    const seq=++sequence.current;setSelected(choice);setQuote(null);setNotice(null);setError('');setBusy(true)
    try{
      const res=await fetch('/api/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:voice.sessionId,messageId:choice.messageId,part:choice.part,amount,quote:true})})
      const result=await res.json();if(seq!==sequence.current)return
      if(!res.ok)throw new Error(result.error)
      setQuote(result);setBalance(result)
      setNotice(['failed','uncertain'].includes(result.existingState)?null:result.cached?'저장된 음성이에요. 추가 차감 없이 들어요.':`최대 ${result.maximumSeconds}초 예약 · 완성된 길이를 1초 단위로 차감해요.`)
    }catch(e){if(seq===sequence.current)setError(e instanceof Error&&e.message==='speech_text_too_long'?'긴 대사예요. 길게를 선택하거나 짧은 대사를 골라 주세요.':'지금은 음성을 준비할 수 없어요.')}
    finally{if(seq===sequence.current)setBusy(false)}
  }
  const listen=async()=>{
    if(!selected||!quote?.canGenerate||working)return
    const seq=sequence.current
    setNotice(null)
    const success=await voice.listen(selected,amount,quote.maximumSeconds===0)
    if(seq!==sequence.current)return
    if(success)setQuote({...quote,cached:true,maximumSeconds:0,canGenerate:true,existingState:'done'})
    else try {
      const res=await fetch('/api/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:voice.sessionId,messageId:selected.messageId,part:selected.part,amount,quote:true})})
      const result=res.ok?await res.json():null
      if(seq===sequence.current){
        setQuote(result)
        if(result?.canGenerate&&result.maximumSeconds>0)setNotice(`최대 ${result.maximumSeconds}초 예약 · 완성된 길이를 1초 단위로 차감해요.`)
      }
    }catch{if(seq===sequence.current)setQuote(null)}
    await refresh().catch(()=>{})
  }
  const buy=async(product:Balance['products'][number])=>{
    const label=`충전 미로 ${product.units}개로 음성 ${product.seconds}초를 구매해요.`
    const pendingKey=`miro:speech:purchase:${voice.sessionId}:${product.id}`
    if(purchase.current?.product!==product.id){
      let id:string|null=null;try{id=sessionStorage.getItem(pendingKey)}catch{}
      purchase.current={product:product.id,id:id&&/^[0-9a-f-]{36}$/i.test(id)?id:crypto.randomUUID()}
      try{sessionStorage.setItem(pendingKey,purchase.current.id)}catch{}
      setNotice(label+' 한 번 더 누르면 구매돼요.');return
    }
    setBusy(true);setError('')
    try{
      const res=await fetch('/api/tts/credits',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:product.id,requestId:purchase.current.id,confirmed:true})})
      if(!res.ok)throw new Error('purchase_failed')
      setBalance(await res.json());purchase.current=null;try{sessionStorage.removeItem(pendingKey)}catch{}
      setNotice('음성 분량을 충전했어요.');setQuote(null);router.refresh()
    }catch{setError('구매를 확인하지 못했어요. 충전 잔액을 확인해 주세요.')}
    finally{setBusy(false);void refreshBalance(true)}
  }
  return <section className={styles.panel} aria-label={t('음성 대사 선택')} data-speech-panel>
    <div className={styles.top}><span data-speech-balance>{balance?.enabled?t('남은 음성 {n}초',{n:balance.remainingSeconds}):t(balance?'음성 준비 중':'음성 분량 확인 중…')}</span>
      <div className={styles.amount}>{(['standard','extended'] as const).map(value=><button key={value} type="button" aria-pressed={amount===value} disabled={working}
        onClick={()=>{sequence.current++;setAmount(value);setQuote(null);setSelected(null);setNotice(null)}}>{t(value==='standard'?'보통':'길게')}</button>)}</div></div>
    <div className={styles.choices}>{voice.choices.map((choice,index)=><button type="button" key={`${choice.messageId}:${choice.part}`} disabled={working||!balance?.enabled}
      aria-pressed={selected?.messageId===choice.messageId&&selected?.part===choice.part} onClick={()=>void choose(choice)}>{index+1}. {choice.text}</button>)}</div>
    {!voice.choices.length&&<p className={styles.status}>{t('캐릭터의 대사가 도착하면 골라 들을 수 있어요.')}</p>}
    {notice&&<div className={styles.warning} role="status"><span>{t(notice)}</span><button type="button" aria-label={t('차감 안내 닫기')} onClick={()=>{setNotice(null);purchase.current=null}}>×</button></div>}
    <div className={styles.actions}>
      {selected&&!['failed','uncertain'].includes(quote?.existingState??'')&&<button type="button" disabled={working||!quote?.canGenerate} onClick={()=>void listen()}>{t(quote?.cached?'다시 듣기':'선택한 대사 듣기')}</button>}
      {(voice.status==='playing'||voice.status==='preparing')&&<button type="button" onClick={voice.stop}>{t('중지')}</button>}
      <span className={styles.status} role="status">{t(error|| (['failed','uncertain'].includes(quote?.existingState??'')?'생성 실패 · 분량 반환':voice.status==='error'?'재생 실패':voice.status==='preparing'?'준비 중…':voice.status==='playing'?'재생 중':''))}</span>
      {quote&&!quote.canGenerate&&!error&&!['failed','uncertain'].includes(quote.existingState??'')&&<span className={styles.status}>{t('음성 분량이 부족해요.')}</span>}
    </div>
    {!!balance?.products.length&&<div className={styles.packs}>{balance.products.map(p=><button key={p.id} type="button" disabled={working} onClick={()=>void buy(p)}>{t('음성 {n}초 · {units} 미로',{n:p.seconds,units:p.units})}</button>)}</div>}
  </section>
}
