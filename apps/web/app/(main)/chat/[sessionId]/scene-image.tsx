'use client'
import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/client'
import { requestPhoto, type MediaState } from './media-actions'
export function SceneImage({sessionId,unveil,cost}:{sessionId:string;unveil:boolean;cost:number}) {
  const t=useT(),router=useRouter()
  const [state,action,pending]=useActionState(requestPhoto,{error:null,notice:null} satisfies MediaState)
  useEffect(()=>{if(state.notice)router.refresh()},[state.notice,router])
  return <form action={action} aria-label={t('상황 이미지')} style={{padding:'6px 16px',fontSize:12,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
    <input type="hidden" name="sessionId" value={sessionId}/>
    <button type="submit" disabled={pending} style={{border:0,borderRadius:8,padding:'8px 12px',background:'var(--color-surface-2)',color:'var(--color-text-primary)',cursor:'pointer'}}>
      {t(pending?'이미지 준비 중…':unveil?'언베일 이미지 보기':'이 장면 보기')}</button>
    <span style={{color:'var(--color-text-tertiary)'}}>{t('기존 이미지 무료 · 새 생성 {n} 미로',{n:cost})}</span>
    {state.error&&<span role="alert" style={{color:'var(--color-danger)'}}>{t(state.error)}</span>}
    {state.notice&&<span role="status">{t(state.notice)}</span>}
  </form>
}
