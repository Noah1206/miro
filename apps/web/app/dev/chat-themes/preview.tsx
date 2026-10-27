'use client'
import { ChatRoomIcon } from '@/components/chat-icons'
import { ChatEmojiButton, ChatSendIcon, ChatInputMore } from '@/components/chat-input-tools'
import { ChatModelProvider, ModelPicker } from '../../(main)/chat/[sessionId]/model-picker'
import { WalletProvider } from '@/components/wallet/provider'
import type { WalletSnapshot } from '@/lib/wallet/types'
import type { ChatModelChoice } from '@/lib/ai/chat-models'
import { useState, useRef } from 'react'
import { ChatTheme, ChatThemePicker, ChatHeaderAvatar, DefaultChatAvatar } from '@/components/chat-theme'
import { MessageList } from '../../(main)/chat/[sessionId]/messages'
import { MessengerThread } from '../../(main)/messages/[sessionId]/thread'
import { TurnsProvider } from '../../(main)/chat/[sessionId]/turns'
import styles from '../../(main)/chat/[sessionId]/chat.module.css'
import textStyles from '../../(main)/messages/[sessionId]/messages.module.css'

const items = [
  { id:'preview-photo', role:'narrator', kind:'photo', content:'/banner-contact-m.webp', blocks:[] },
  { id:'preview-1', at:'2026-10-12T09:06:00Z', role:'character', kind:'text', content:'', blocks:[{type:'narrative',text:'창밖으로 빗소리가 들린다. 그가 휴대폰을 내려놓고 당신을 본다.'},{type:'dialogue',text:'우산 가져왔어요?',speaker:'서이안'}]},
  { id:'preview-2', at:'2026-10-12T09:07:00Z', role:'user', kind:'text', content:'아니, 금방 그칠 줄 알았지.', blocks:[] },
  { id:'preview-3', at:'2026-10-12T09:08:00Z', role:'character', kind:'text', content:'', blocks:[{type:'action',text:'의자에 걸쳐 둔 우산을 집어 든다.',speaker:'서이안'},{type:'dialogue',text:'같이 가요. 역까지는 같은 방향이니까.',speaker:'서이안'}]},
]
const texts = [
  {id:'text-1',role:'character',kind:'reality_message',content:'집에 도착했어요?',blocks:[],at:'2026-10-12T11:21:00Z'},
  {id:'text-2',role:'user',kind:'user_message',content:'응. 우산 덕분에 안 젖었어.',blocks:[],at:'2026-10-12T11:22:00Z'},
  {id:'text-3',role:'character',kind:'reality_message',content:'다행이다.\n우산은 다음에 줘요.',blocks:[],at:'2026-10-12T11:23:00Z'},
]
const wallet: WalletSnapshot = {userId:'preview',observedAt:0,rechargeRemaining:0,monthlyRemaining:0,available:0,plan:'free',resetsAt:null,account:null,products:[],order:null,history:{entries:[],cursor:null}}
const choices: ChatModelChoice[] = [{id:'preview:scene',name:'미로',length:'scene',maximumTokens:0,maxOutputTokens:0},{id:'preview:long',name:'에코',length:'long',maximumTokens:0,maxOutputTokens:0}]
export function ThemePreview() {
  const ta = useRef<HTMLTextAreaElement>(null)
  const [draft,setDraft] = useState('')
  const [reference,setReference] = useState(false)
  const [messenger,setMessenger] = useState(false)
  const s = messenger ? textStyles : styles
  return <WalletProvider><style>{'nextjs-portal { display: none; }'}</style><ChatModelProvider initialWallet={wallet} initialModel="preview:scene"><TurnsProvider><ChatTheme sessionId="theme-preview"><main id="main" className="chat-layout"><section className={`chat-main ${s.main}`}>
    <header className={s.header}><span aria-hidden style={{fontSize:24}}>‹</span><ChatHeaderAvatar /><div className={styles.headerIdentity}><h1 className={s.title}>서이안</h1></div><button type="button" onClick={()=>setMessenger(!messenger)} aria-label={messenger ? '캐릭터챗 보기' : '문자방 보기'} className={styles.contextButton}><ChatRoomIcon /></button><ChatThemePicker />{!messenger && <ModelPicker freeReady proReady choices={choices} />}</header>
    <p style={{fontSize:11,textAlign:'center',margin:'8px 0',opacity:.65}}>테마 미리보기 · 예시 대화 <button type="button" onClick={()=>setReference(!reference)} style={{border:0,background:'transparent',color:'inherit',textDecoration:'underline',marginLeft:8}}>{reference ? '기존 대화 보기' : '레퍼런스 대화 보기'}</button></p>
    {reference ? <ReferenceConversation /> : messenger ? <MessengerThread items={texts} characterName="서이안" /> : <div className={styles.transcript}><MessageList items={items} characterName="서이안" /></div>}
    <div className={s.composer}><div className={messenger ? textStyles.form : styles.composerForm}><ChatInputMore onInsert={text=>setDraft(value=>(value+text).slice(0,2000))} /><textarea ref={ta} maxLength={2000} className={s.input} value={draft} onChange={e=>setDraft(e.target.value)} aria-label="미리보기 입력" placeholder="메시지 보내기" rows={1} /><div className={styles.composerBar}><ChatEmojiButton textareaRef={ta} onDraftChange={setDraft} onSelect={emoji=>setDraft(value=>value+emoji)} /><button data-empty={!draft.trim()} type="button" className={s.send} disabled aria-label="미리보기에서는 전송하지 않아요"><ChatSendIcon /></button></div></div></div>
  </section></main></ChatTheme></TurnsProvider></ChatModelProvider></WalletProvider>
}

// Reference-only fixture: unread counts are visual samples, not real read receipts.
function ReferenceConversation() {
  return <div className={styles.transcript}><div className={styles.messages} role="log" aria-label="레퍼런스 예시 대화">
    {[
      {name:'설아누나',text:'얼릉 낫구 빨리봐요!! 🥺',time:'오후 1:54'},
      {name:'온유누나',text:'ㅠㅠㅠㅠㅠ미아뉴ㅠㅠ담에 맛있는거 사줄게\nㅠㅠ',time:'오후 3:52'},
      {name:'서이안',text:'웅니 그래두 끼니 잘 챙기시구 빨리 나으세여\n오🤍',time:'오후 3:53'},
    ].map(message=><div key={message.name} className={styles.characterRow}>
      <span className={styles.avatar} aria-hidden><DefaultChatAvatar /></span>
      <div className={styles.characterContent}>
        <p className={styles.speaker}>{message.name}</p>
        <div className={styles.timedBubble}>
          <div className={styles.bubble}><p style={{whiteSpace:'pre-wrap'}}>{message.text}</p></div>
          <span className={styles.bubbleTime} style={{display:'flex',flexDirection:'column',gap:4}}><span style={{color:'#fff000'}} aria-label="미확인 인원 예시 3명">3</span><span>{message.time}</span></span>
        </div>
      </div>
    </div>)}
  </div></div>
}
