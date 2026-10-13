'use client'
import { useState } from 'react'
import { Button, Sheet } from '@/components/ui'
import { RechargeCatalog } from '@/components/wallet/recharge-catalog'
const products = [
 {id:'small',name:'',units:300,priceMinor:3000,currency:'KRW'},
 {id:'medium',name:'',units:800,priceMinor:7000,currency:'KRW'},
 {id:'large',name:'',units:1800,priceMinor:14000,currency:'KRW'},
 {id:'xl',name:'',units:4000,priceMinor:29000,currency:'KRW'},
]
export function RechargePreview() {
 const [open,setOpen]=useState(true),[selected,setSelected]=useState(''),[next,setNext]=useState(false)
 return <main style={{minHeight:'100dvh',padding:'40px 24px',background:'#101014',color:'#f5f2fa'}}>
  <div style={{maxWidth:680,margin:'0 auto'}}><p style={{fontSize:12,color:'#b8a6ff',marginBottom:12}}>MIRO · LOCAL PREVIEW</p><h1 style={{fontSize:24}}>토큰 충전 디자인</h1><p style={{color:'#aaa4b6',margin:'12px 0 24px'}}>실제 결제·주문이 없는 디자인 미리보기예요.</p><Button onClick={()=>{setNext(false);setOpen(true)}}>충전 화면 열기</Button>
  <h2 style={{fontSize:15,margin:'40px 0 14px'}}>디자인 레퍼런스</h2><div style={{display:'grid',gap:12,fontSize:14}}>
  <a href="https://docs.tosspayments.com/guides/payment-widget/integration" target="_blank" rel="noreferrer">토스페이먼츠 — 분명한 선택 상태와 하단 행동 버튼 ↗</a>
  <a href="https://eseon.tistory.com/624" target="_blank" rel="noreferrer">네이버 시리즈 — 수량과 가격을 나란히 비교 ↗</a>
  <a href="https://envia.tistory.com/126" target="_blank" rel="noreferrer">카카오페이지 — 보유 잔액과 충전 금액 구분 ↗</a></div></div>
  <Sheet open={open} onClose={()=>setOpen(false)} title="충전">
   {next ? <div style={{display:'grid',gap:18}}><h2>선택한 금액 확인</h2><p>미리보기에서만 이동했어요. 실제 주문은 생성하지 않았어요.</p><Button onClick={()=>setNext(false)}>금액 다시 선택</Button></div> : <RechargeCatalog available={0} products={products} selected={selected} onSelect={setSelected} onNext={()=>setNext(true)} onClose={()=>setOpen(false)} />}
  </Sheet>
 </main>
}
